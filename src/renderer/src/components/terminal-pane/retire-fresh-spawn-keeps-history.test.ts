import { describe, expect, it } from 'vitest'
import { retiredFreshSpawnKillOptions } from './retire-fresh-spawn-kill-options'

/**
 * Observed live: a pane destroyed while its spawn was still in flight killed the
 * fresh PTY with no `keepHistory`, tombstoning the session id. The switch's own
 * cold restore resumes that exact id, so it was refused with
 * TerminalKilledError — swallowed by `connect()`, which returns undefined — and
 * the pane stayed empty through all five respawn sweeps, recovering only on the
 * next switch when a new id was minted.
 */
describe('retiring a fresh spawn', () => {
  it('preserves history while a default switch owns the worktree', () => {
    expect(retiredFreshSpawnKillOptions({ inDefaultSwitchTeardownWindow: true })).toEqual({
      keepHistory: true,
      retainSurface: true
    })
  })

  it('still tombstones outside a switch, so Kill-All keeps rejecting resurrection', () => {
    expect(retiredFreshSpawnKillOptions({ inDefaultSwitchTeardownWindow: false })).toBeUndefined()
  })
})
