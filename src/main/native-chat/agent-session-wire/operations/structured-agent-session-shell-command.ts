import { randomUUID } from 'node:crypto'
import { isAbsolute, win32 as pathWin32 } from 'node:path'
import { runProcess } from '@orca/process-host'
import type { ProcessSpec } from '@orca/process-host/process-spec'
import { resolveAgentSessionLaunchDirectory } from '../../../runtime/agent-session/launch/agent-session-launch-directory'
import { hostShellEnvironment } from '../../../runtime/agent-session/environment/structured-agent-shell-environment'
import { resolveProfileLoadingShell } from '../../../startup/shell-environment/hydrate-shell-path'
import type { StructuredAgentSessionHost } from '../host/structured-agent-session-host'
import { writeStructuredAgentSessionOrcaNote } from '../structured-agent-session-orca-note'
import {
  NATIVE_CHAT_SHELL_COMMAND_TIMEOUT_MS,
  nativeChatShellCommandBody,
  nativeChatShellCommandClientMessageId,
  nativeChatShellCommandRowText,
  type NativeChatShellCommandResult
} from '../../../../shared/native-chat/native-chat-shell-command'
import type { AgentSessionShellCommandResult } from '../../../../shared/rpc-contract/structured-agent-session/structured-agent-session-shell-command-params'

const OUTPUT_CAPTURE_BYTES = 256 * 1024

export type StructuredShellCommandDeps = {
  host: Pick<StructuredAgentSessionHost, 'deps' | 'conversation'>
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
  { store, resolveWorkspacePath }: StructuredShellCommandDeps['host']['deps'],
  record: NonNullable<ReturnType<StructuredShellCommandDeps['host']['deps']['store']['getRecord']>>
): Promise<string | null> {
  try {
    const folder = resolveWorkspacePath
      ? await resolveAgentSessionLaunchDirectory({ store, resolveWorkspacePath }, record)
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
  const record = deps.host.deps.store.getRecord(sessionId)
  if (!record) {
    return { ok: false, reason: 'not-open' }
  }
  const { journal } = await deps.host.conversation(sessionId)
  const [turn, pending] = await Promise.all([
    journal.reads.newestTurn(),
    journal.reads.pendingSubmissions()
  ])
  if (turn?.state === 'running' || pending.length > 0) {
    return { ok: false, reason: 'working' }
  }
  const cwd = await chatFolder(deps.host.deps, record)
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
  const runId = randomUUID()
  await writeStructuredAgentSessionOrcaNote(
    deps.host,
    sessionId,
    nativeChatShellCommandClientMessageId(runId),
    nativeChatShellCommandBody({ runId, text: nativeChatShellCommandRowText(result) })
  )
  return { ok: true }
}
