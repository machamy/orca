import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import type { AgentSessionShellCommandResult } from '../../../../../shared/rpc-contract/structured-agent-session-shell-command-params'
import { isNativeChatShellCommandUnsupportedError } from '../../../../../shared/native-chat/native-chat-shell-command'
import { callStructuredAgentSession } from './structured-agent-session-call'

export async function runStructuredAgentSessionShellCommand(
  target: RuntimeClientTarget,
  sessionId: string,
  command: string
): Promise<AgentSessionShellCommandResult | 'unsupported'> {
  try {
    return await callStructuredAgentSession<AgentSessionShellCommandResult>(
      target,
      'agentSession.shellCommand',
      { sessionId, command }
    )
  } catch (error) {
    if (isNativeChatShellCommandUnsupportedError(error)) {
      return 'unsupported'
    }
    throw error
  }
}
