import type {
  AgentJournalItemBody,
  AgentJournalPlainStatusItem
} from '../agent-session/journal/agent-session-journal-types'
import { sliceAtCodeUnitLimit } from '../text/surrogate-safe-text-slice'

/** `!cmd` in a chat composer: the host runs it in the chat's folder and the agent reads it with the next message. */
export const NATIVE_CHAT_SHELL_COMMAND_MAX_LENGTH = 8192
export const NATIVE_CHAT_SHELL_COMMAND_TIMEOUT_MS = 120_000
export const NATIVE_CHAT_SHELL_COMMAND_OUTPUT_MAX_CHARS = 32_000
/** All runs one message carries; past it the oldest are only counted. */
export const NATIVE_CHAT_SHELL_COMMAND_CONTEXT_MAX_CHARS = 64_000

const ID_PREFIX = 'shell-command:'

export function nativeChatShellCommandOfDraft(text: string): string | null {
  if (!text.startsWith('!')) {
    return null
  }
  const command = text.slice(1).trim()
  return command === '' ? null : command
}

/** Fork: composers show shell mode from the first `!`, before a command follows it. */
export function isNativeChatShellCommandDraft(text: string): boolean {
  return text.startsWith('!')
}

export function nativeChatShellCommandClientMessageId(runId: string): string {
  return `${ID_PREFIX}${runId}`
}

/** One run as its row keeps it; `readWith` is the person's message the agent read it with. */
export type NativeChatShellCommandRun = { runId: string; text: string; readWith?: string }

/** A plain command-output row carrying its run; the status-row storage schema names `shellCommand`. */
export type NativeChatShellCommandItem = AgentJournalPlainStatusItem & {
  shellCommand: NativeChatShellCommandRun
}

export function nativeChatShellCommandBody(
  run: NativeChatShellCommandRun
): NativeChatShellCommandItem {
  return { kind: 'status', presentation: 'command-output', text: run.text, shellCommand: run }
}

export function nativeChatShellCommandOf(
  body: AgentJournalItemBody
): NativeChatShellCommandRun | null {
  if (body.kind !== 'status' || !('shellCommand' in body)) {
    return null
  }
  const run: unknown = body.shellCommand
  if (typeof run !== 'object' || run === null) {
    return null
  }
  const { runId, text, readWith } = run as Record<string, unknown>
  return typeof runId === 'string' && typeof text === 'string'
    ? { runId, text, ...(typeof readWith === 'string' ? { readWith } : {}) }
    : null
}

export type NativeChatShellCommandResult = {
  command: string
  stdout: string
  stderr: string
  exitCode: number | null
  signal: string | null
  timedOut: boolean
  truncated: boolean
}

function boundedOutput(text: string): { text: string; cut: boolean } {
  return text.length > NATIVE_CHAT_SHELL_COMMAND_OUTPUT_MAX_CHARS
    ? { text: sliceAtCodeUnitLimit(text, NATIVE_CHAT_SHELL_COMMAND_OUTPUT_MAX_CHARS), cut: true }
    : { text, cut: false }
}

/** The chat row: the command as typed, its output, then how it ended when that was not a clean exit. */
export function nativeChatShellCommandRowText(result: NativeChatShellCommandResult): string {
  const joined = [result.stdout, result.stderr]
    .map((part) => part.replace(/\s+$/u, ''))
    .filter((part) => part !== '')
    .join('\n')
  const output = boundedOutput(joined)
  const endings: string[] = []
  if (result.timedOut) {
    endings.push(`[timed out after ${NATIVE_CHAT_SHELL_COMMAND_TIMEOUT_MS / 1000}s]`)
  } else if (result.signal) {
    endings.push(`[killed by ${result.signal}]`)
  } else if (result.exitCode !== 0 && result.exitCode !== null) {
    endings.push(`[exit ${result.exitCode}]`)
  }
  if (result.truncated || output.cut) {
    endings.push('[output truncated]')
  }
  return [`$ ${result.command}`, ...(output.text ? [output.text] : []), ...endings].join('\n')
}

/** What the agent receives ahead of the next message: the rows it never saw run. */
export function nativeChatShellCommandAgentContext(rowTexts: readonly string[]): string {
  const kept: string[] = []
  let room = NATIVE_CHAT_SHELL_COMMAND_CONTEXT_MAX_CHARS
  for (const text of rowTexts.toReversed()) {
    if (text.length > room) {
      break
    }
    kept.unshift(text)
    room -= text.length
  }
  const omitted = rowTexts.length - kept.length
  return [
    '<orca-shell-commands>',
    'Before this message, the user ran these shell commands in the chat folder through Orca. You did not run them; their output is context for the message.',
    '',
    ...(omitted > 0 ? [`[${omitted} earlier command${omitted === 1 ? '' : 's'} omitted]`, ''] : []),
    kept.join('\n\n'),
    '</orca-shell-commands>'
  ].join('\n')
}

/** A host predating `agentSession.shellCommand` answers with one of these, before running anything. */
export function isNativeChatShellCommandUnsupportedError(error: unknown): boolean {
  const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : null
  return code === 'method_not_found' || code === 'forbidden'
}

/** The client waits past the host's own deadline, which the host reports as a timed-out row. */
export const NATIVE_CHAT_SHELL_COMMAND_CALL_TIMEOUT_MS =
  NATIVE_CHAT_SHELL_COMMAND_TIMEOUT_MS + 15_000
