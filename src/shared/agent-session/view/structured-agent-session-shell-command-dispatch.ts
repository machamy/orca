import type { AgentSessionShellCommandResult } from '../../rpc-contract/structured-agent-session/structured-agent-session-shell-command-params'
import {
  structuredComposerFailure,
  type StructuredComposerFailureCode
} from '../failures/structured-agent-session-composer-failure'
import type { StructuredAgentSessionCommandOutcome } from './structured-agent-session-composer'

const SHELL_COMMAND_REFUSALS = {
  working: 'shellCommandWorking',
  'not-open': 'shellCommandNotOpen',
  'folder-unavailable': 'shellCommandFolderUnavailable'
} as const satisfies Record<string, StructuredComposerFailureCode>

/** `!cmd` as a composer command: a refusal comes back in the composer's own words. */
export async function dispatchStructuredAgentSessionShellCommand(
  run: (command: string) => Promise<AgentSessionShellCommandResult | 'unsupported'>,
  command: string,
  onSent?: () => void
): Promise<StructuredAgentSessionCommandOutcome> {
  let result: Awaited<ReturnType<typeof run>>
  try {
    const running = run(command)
    // The command may run for minutes; the draft leaves now and comes back on a refusal.
    onSent?.()
    result = await running
  } catch {
    return { handled: true, accepted: false, ...structuredComposerFailure('shellCommandFailed') }
  }
  if (result === 'unsupported') {
    return {
      handled: true,
      accepted: false,
      ...structuredComposerFailure('shellCommandUnsupportedByHost')
    }
  }
  if (!result.ok) {
    return {
      handled: true,
      accepted: false,
      ...structuredComposerFailure(SHELL_COMMAND_REFUSALS[result.reason])
    }
  }
  return { handled: true, accepted: true, error: null }
}
