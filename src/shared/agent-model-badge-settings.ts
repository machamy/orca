/**
 * Fork: the pane-corner badge naming the agent's current model and reasoning effort.
 * Shared because both the renderer surface and the settings schema read the same
 * corner set — a corner the schema accepts but the surface cannot place is a bug
 * only a shared union prevents.
 */

export const AGENT_MODEL_BADGE_CORNERS = ['top-left', 'top-right', 'bottom-right'] as const

export type AgentModelBadgeCorner = (typeof AGENT_MODEL_BADGE_CORNERS)[number]

export type AgentModelBadgeSettings = {
  enabled: boolean
  corner: AgentModelBadgeCorner
}

/** Bottom-right by default: a pane's top edge already carries the title and the
 *  split/close cluster, so a top corner sits on chrome the user reaches for. */
export const DEFAULT_AGENT_MODEL_BADGE: AgentModelBadgeSettings = {
  enabled: true,
  corner: 'bottom-right'
}

export function isAgentModelBadgeCorner(value: unknown): value is AgentModelBadgeCorner {
  return AGENT_MODEL_BADGE_CORNERS.includes(value as AgentModelBadgeCorner)
}

/** Why total: a profile written before this feature has no record at all, and a
 *  corner retired by a later release must not strand the badge off-screen. */
export function resolveAgentModelBadgeSettings(
  stored: Partial<AgentModelBadgeSettings> | undefined
): AgentModelBadgeSettings {
  return {
    enabled: stored?.enabled ?? DEFAULT_AGENT_MODEL_BADGE.enabled,
    corner: isAgentModelBadgeCorner(stored?.corner)
      ? stored.corner
      : DEFAULT_AGENT_MODEL_BADGE.corner
  }
}
