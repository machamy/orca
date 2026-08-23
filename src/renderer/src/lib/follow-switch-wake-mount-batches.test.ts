import { describe, expect, it } from 'vitest'
import { planFollowWakeMountBatches } from './follow-switch-wake-mount-batches'

describe('planFollowWakeMountBatches', () => {
  it('mounts the agent tabs before the plain ones', () => {
    const batches = planFollowWakeMountBatches({
      liveTabIds: ['plain-1', 'agent-1', 'plain-2', 'agent-2'],
      agentTabIds: new Set(['agent-1', 'agent-2'])
    })

    expect(batches).toEqual([['agent-1', 'agent-2', 'plain-1', 'plain-2']])
  })

  it('splits a tab-heavy worktree instead of mounting it in one render pass', () => {
    const liveTabIds = Array.from({ length: 40 }, (_, index) => `tab-${index}`)

    const batches = planFollowWakeMountBatches({ liveTabIds, agentTabIds: new Set() })

    expect(batches.length).toBeGreaterThan(1)
    expect(Math.max(...batches.map((batch) => batch.length))).toBeLessThanOrEqual(6)
    // Every tab still gets mounted — batching delays, it does not drop.
    expect(batches.flat()).toEqual(liveTabIds)
  })

  it('returns nothing to mount for an empty worktree', () => {
    expect(planFollowWakeMountBatches({ liveTabIds: [], agentTabIds: new Set() })).toEqual([])
  })
})
