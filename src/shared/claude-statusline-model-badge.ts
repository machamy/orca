/**
 * Fork: the model and reasoning effort Claude hands its statusLine command on every
 * refresh, forwarded so the pane badge tracks a mid-session `/model` or `/effort`.
 *
 * Why the statusline: hook payloads carry `effort` but never `model` (only
 * SessionStart names one, once), so the statusline is the only feed that follows a
 * model switch. Kept apart from agent status on purpose, like the statusline's rate
 * limits: it is presentation for one badge, not a claim about the agent's state.
 */

export const CLAUDE_STATUSLINE_MODEL_PATHNAME = '/statusline/claude-model'
export const AGENT_MODEL_BADGE_STATUSLINE_CHANNEL = 'agentModelBadge:statusLine'
export const AGENT_MODEL_BADGE_SNAPSHOT_CHANNEL = 'agentModelBadge:snapshot'

// Model names and effort levels are short; anything longer is not what we asked for.
const MAX_FIELD_LENGTH = 120

export type ClaudeStatusLineModelReport = {
  paneKey: string
  model: string | null
  effort: string | null
}

function boundedField(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed && trimmed.length <= MAX_FIELD_LENGTH ? trimmed : null
}

/** Reads the wrapper script's form post; null when it names no pane or carries nothing. */
export function parseClaudeStatusLineModelBody(body: unknown): ClaudeStatusLineModelReport | null {
  if (typeof body !== 'object' || body === null) {
    return null
  }
  const fields: Record<string, unknown> = { ...body }
  const paneKey = boundedField(fields.paneKey)
  const model = boundedField(fields.model)
  const effort = boundedField(fields.effort)
  if (!paneKey || (!model && !effort)) {
    return null
  }
  return { paneKey, model, effort }
}
