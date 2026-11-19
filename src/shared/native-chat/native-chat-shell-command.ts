import { parseAgentJournalItemKey } from '../agent-session/journal/agent-session-journal-item-key'

/** `!cmd` in a chat composer: the host runs it in the chat's folder and the agent reads it with the next message. */
export const NATIVE_CHAT_SHELL_COMMAND_MAX_LENGTH = 8192
export const NATIVE_CHAT_SHELL_COMMAND_TIMEOUT_MS = 120_000
export const NATIVE_CHAT_SHELL_COMMAND_OUTPUT_MAX_CHARS = 32_000

const ID_PREFIX = 'shell-command:'

export function nativeChatShellCommandOfDraft(text: string): string | null {
  if (!text.startsWith('!')) {
    return null
  }
  const command = text.slice(1).trim()
  return command === '' ? null : command
}

export function nativeChatShellCommandClientMessageId(runId: string): string {
  return `${ID_PREFIX}${runId}`
}

export function isNativeChatShellCommandItemId(itemId: string): boolean {
  const identity = parseAgentJournalItemKey(itemId)
  return identity?.provider === 'orca' && identity.clientMessageId.startsWith(ID_PREFIX)
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
    ? { text: text.slice(0, NATIVE_CHAT_SHELL_COMMAND_OUTPUT_MAX_CHARS), cut: true }
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
  return [
    '<orca-shell-commands>',
    'Before this message, the user ran these shell commands in the chat folder through Orca. You did not run them; their output is context for the message.',
    '',
    rowTexts.join('\n\n'),
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
