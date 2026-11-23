// `agentSession.shellCommand` — a person's `!cmd`: the host runs it in the chat folder and records
// the output as an Orca row; fork: then starts a turn on it unless the host's setting is off. Older hosts lack the method; clients say so.

import { defineMethod } from '../../../core'
import {
  ensureStructuredHostInstalled,
  requireStructuredCapability,
  requireStructuredSessionHost
} from '../creation/structured-agent-session-gate'
import { ShellCommandParams } from '../../../../../../shared/rpc-contract/structured-agent-session/structured-agent-session-shell-command-params'
import { runStructuredAgentSessionShellCommand } from '../../../../../native-chat/agent-session-wire/operations/structured-agent-session-shell-command'

export const STRUCTURED_AGENT_SESSION_SHELL_COMMAND_METHODS = [
  defineMethod({
    name: 'agentSession.shellCommand',
    permission: 'workspace',
    params: ShellCommandParams,
    handler: async (params, ctx) => {
      requireStructuredCapability(ctx)
      await ensureStructuredHostInstalled(ctx)
      const host = requireStructuredSessionHost(ctx, params.sessionId)
      const startsTurn =
        ctx.runtime.requireStore().getSettings().nativeChatShellCommandStartsTurn !== false
      return runStructuredAgentSessionShellCommand(
        { host, startsTurn },
        params.sessionId,
        params.command.trim()
      )
    }
  })
]
