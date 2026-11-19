import { randomUUID } from 'node:crypto'
import { isAbsolute, win32 as pathWin32 } from 'node:path'
import { runProcess } from '@orca/process-host'
import type { ProcessSpec } from '@orca/process-host/process-spec'
import type { AgentSessionRecordStore } from '../../../runtime/agent-session/records/agent-session-record-store'
import { resolveAgentSessionLaunchDirectory } from '../../../runtime/agent-session/agent-session-launch-directory'
import { hostShellEnvironment } from '../../../runtime/agent-session/environment/structured-agent-shell-environment'
import { resolveProfileLoadingShell } from '../../../startup/hydrate-shell-path'
import type { AgentSessionJournal } from '../../agent-session-journal/journal-store'
import { journalRestsBetweenTurns } from '../../agent-session-journal/journal-between-turns'
import {
  NATIVE_CHAT_SHELL_COMMAND_TIMEOUT_MS,
  nativeChatShellCommandClientMessageId,
  nativeChatShellCommandRowText,
  type NativeChatShellCommandResult
} from '../../../../shared/native-chat/native-chat-shell-command'
import type { AgentSessionShellCommandResult } from '../../../../shared/rpc-contract/structured-agent-session-shell-command-params'

const OUTPUT_CAPTURE_BYTES = 256 * 1024

export type StructuredShellCommandDeps = {
  store: Pick<AgentSessionRecordStore, 'getRecord' | 'pinLaunchDirectory'>
  resolveWorkspacePath?: (workspaceId: string) => Promise<string>
  openJournal: (sessionId: string) => AgentSessionJournal | null
  run?: (spec: ProcessSpec) => ReturnType<typeof runProcess>
}

function shellInvocation(
  command: string
): Pick<ProcessSpec, 'program' | 'args'> & Partial<Pick<ProcessSpec, 'windowsVerbatimArguments'>> {
  const shell = resolveProfileLoadingShell()
  if (process.platform !== 'win32') {
    return { program: shell ?? '/bin/sh', args: ['-c', command] }
  }
  if (!shell) {
    return {
      program: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `"${command}"`],
      windowsVerbatimArguments: true
    }
  }
  const name = pathWin32.basename(shell).toLowerCase()
  return name === 'powershell.exe' || name === 'pwsh.exe'
    ? { program: shell, args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command] }
    : { program: shell, args: ['-c', command] }
}

async function chatFolder(
  deps: StructuredShellCommandDeps,
  record: NonNullable<ReturnType<StructuredShellCommandDeps['store']['getRecord']>>
): Promise<string | null> {
  try {
    const folder = deps.resolveWorkspacePath
      ? await resolveAgentSessionLaunchDirectory(
          { store: deps.store, resolveWorkspacePath: deps.resolveWorkspacePath },
          record
        )
      : record.launchDirectory
    return folder && isAbsolute(folder) ? folder : null
  } catch {
    return null
  }
}

/** Runs a person's `!cmd` beside the agent and records it as an Orca row the next message carries. */
export async function runStructuredAgentSessionShellCommand(
  deps: StructuredShellCommandDeps,
  sessionId: string,
  command: string
): Promise<AgentSessionShellCommandResult> {
  const journal = deps.openJournal(sessionId)
  const record = deps.store.getRecord(sessionId)
  if (!journal || !record) {
    return { ok: false, reason: 'not-open' }
  }
  if (!journalRestsBetweenTurns(journal)) {
    return { ok: false, reason: 'working' }
  }
  const cwd = await chatFolder(deps, record)
  if (!cwd) {
    return { ok: false, reason: 'folder-unavailable' }
  }
  const run = deps.run ?? runProcess
  const outcome = await run({
    ...shellInvocation(command),
    cwd,
    // No terminal answers a prompt, so git must fail instead of waiting for one.
    env: { ...(await hostShellEnvironment()), GIT_TERMINAL_PROMPT: '0' },
    timeoutMs: NATIVE_CHAT_SHELL_COMMAND_TIMEOUT_MS,
    maxOutputBytes: OUTPUT_CAPTURE_BYTES
  })
  const result: NativeChatShellCommandResult = {
    command,
    stdout: outcome.stdout,
    stderr: outcome.stderr,
    exitCode: outcome.code,
    signal: outcome.signal,
    timedOut: outcome.timedOut,
    truncated: outcome.outputTruncated === true
  }
  await journal.appendItem(
    { provider: 'orca', clientMessageId: nativeChatShellCommandClientMessageId(randomUUID()) },
    {
      kind: 'status',
      presentation: 'command-output',
      text: nativeChatShellCommandRowText(result)
    },
    { fence: record.lease.runtimeFence, turnScope: { kind: 'thread' } }
  )
  return { ok: true }
}
