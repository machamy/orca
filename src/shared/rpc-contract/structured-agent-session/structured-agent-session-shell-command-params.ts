import { z } from 'zod'
import { OptionsParams } from './structured-agent-session-params'
import { NATIVE_CHAT_SHELL_COMMAND_MAX_LENGTH } from '../../native-chat/native-chat-shell-command'

export const ShellCommandParams = OptionsParams.extend({
  command: z
    .string()
    .max(NATIVE_CHAT_SHELL_COMMAND_MAX_LENGTH)
    .refine((value) => value.trim().length > 0, 'Command is empty')
}).strict()

export type AgentSessionShellCommandRefusal = 'working' | 'not-open' | 'folder-unavailable'

export type AgentSessionShellCommandResult =
  | { ok: true }
  | { ok: false; reason: AgentSessionShellCommandRefusal }
