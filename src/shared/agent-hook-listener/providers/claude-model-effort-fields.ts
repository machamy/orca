/**
 * Fork: reads the model and reasoning effort Claude already puts in every
 * tool-use hook payload.
 *
 * Claude sends `model` as an object (`{ id, display_name }`) and `effort` as
 * `{ level }`, but the shared normalizer keeps only string fields — so both were
 * dropped on the floor and a Claude pane's status row never carried either one.
 * Flattening happens here rather than in the normalizer because the object shape
 * is Claude's, not a property of agent status in general.
 *
 * `effort` rides tool-use-context hooks (PreToolUse, PostToolUse, Stop, …) on
 * models that support it, so it is absent on session-lifecycle events and on
 * models without the parameter — never treat absence as "no effort".
 */

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

/** Display name first: it is what the user picked in `/model`, and the id can be
 *  a dated alias (`claude-opus-5-20260114`) nobody recognises. */
export function readClaudeModelField(hookPayload: Record<string, unknown>): string | undefined {
  const model = hookPayload['model']
  if (typeof model === 'string') {
    return firstNonEmptyString(model)
  }
  if (typeof model !== 'object' || model === null) {
    return undefined
  }
  const fields = model as { display_name?: unknown; id?: unknown }
  return firstNonEmptyString(fields.display_name, fields.id)
}

export function readClaudeEffortField(hookPayload: Record<string, unknown>): string | undefined {
  const effort = hookPayload['effort']
  if (typeof effort === 'string') {
    return firstNonEmptyString(effort)
  }
  if (typeof effort !== 'object' || effort === null) {
    return undefined
  }
  return firstNonEmptyString((effort as { level?: unknown }).level)
}
