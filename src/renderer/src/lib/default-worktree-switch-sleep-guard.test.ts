import { afterEach, describe, expect, it } from 'vitest'
import {
  beginDefaultSwitchSleepGuard,
  beginDefaultSwitchTeardownWindow,
  endDefaultSwitchSleepGuard,
  endDefaultSwitchTeardownWindow,
  isDefaultSwitchSleepGuarded,
  isInDefaultSwitchTeardownWindow
} from './default-worktree-switch-sleep-guard'

const LEFT = 'repo::/repo'
const RIGHT = 'repo::/feature'
const NOW = 1_700_000_000_000

afterEach(() => {
  endDefaultSwitchSleepGuard()
  endDefaultSwitchTeardownWindow()
})

describe('default-switch teardown window', () => {
  it('outlives the spawn guard, which the wake lifts before the PTY kills land', () => {
    beginDefaultSwitchSleepGuard([LEFT, RIGHT], NOW)
    beginDefaultSwitchTeardownWindow([LEFT, RIGHT], NOW)

    // The follow-wake lifts the spawn guard so mounts can cold-restore…
    endDefaultSwitchSleepGuard()
    expect(isDefaultSwitchSleepGuarded(LEFT, NOW)).toBe(false)
    // …but a late exit arriving after it must still not tear the pane down.
    expect(isInDefaultSwitchTeardownWindow(LEFT, NOW + 5_000)).toBe(true)
    expect(isInDefaultSwitchTeardownWindow(RIGHT, NOW + 5_000)).toBe(true)
  })

  it('expires on its own so a crashed switch cannot suppress teardown forever', () => {
    beginDefaultSwitchTeardownWindow([LEFT], NOW)
    expect(isInDefaultSwitchTeardownWindow(LEFT, NOW + 89_000)).toBe(true)
    expect(isInDefaultSwitchTeardownWindow(LEFT, NOW + 91_000)).toBe(false)
  })

  it('covers only the swapped worktrees', () => {
    beginDefaultSwitchTeardownWindow([LEFT], NOW)
    expect(isInDefaultSwitchTeardownWindow(RIGHT, NOW)).toBe(false)
  })

  it('clears on the failure paths that wake the agents back in place', () => {
    beginDefaultSwitchTeardownWindow([LEFT, RIGHT], NOW)
    endDefaultSwitchTeardownWindow()
    expect(isInDefaultSwitchTeardownWindow(LEFT, NOW)).toBe(false)
    expect(isInDefaultSwitchTeardownWindow(RIGHT, NOW)).toBe(false)
  })
})
