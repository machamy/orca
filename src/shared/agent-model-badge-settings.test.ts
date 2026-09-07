import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_MODEL_BADGE,
  isAgentModelBadgeCorner,
  resolveAgentModelBadgeSettings
} from './agent-model-badge-settings'

describe('resolveAgentModelBadgeSettings', () => {
  it('gives a profile written before the feature the default', () => {
    expect(resolveAgentModelBadgeSettings(undefined)).toEqual(DEFAULT_AGENT_MODEL_BADGE)
  })

  it('keeps a stored pick', () => {
    expect(resolveAgentModelBadgeSettings({ enabled: false, corner: 'top-left' })).toEqual({
      enabled: false,
      corner: 'top-left'
    })
  })

  it('preserves `enabled: false` rather than reading absent as off', () => {
    // Why: `??` on a boolean is the easy bug here — a user who hid the badge
    // must not get it back on the next launch.
    expect(resolveAgentModelBadgeSettings({ enabled: false }).enabled).toBe(false)
  })

  it('falls back to a placeable corner when the stored one is not one of ours', () => {
    // A corner retired by a later release must not strand the badge off-screen.
    expect(
      resolveAgentModelBadgeSettings({ enabled: true, corner: 'bottom-left' as never }).corner
    ).toBe(DEFAULT_AGENT_MODEL_BADGE.corner)
  })

  it('rejects non-corner values', () => {
    expect(isAgentModelBadgeCorner('top-right')).toBe(true)
    expect(isAgentModelBadgeCorner('centre')).toBe(false)
    expect(isAgentModelBadgeCorner(undefined)).toBe(false)
  })
})
