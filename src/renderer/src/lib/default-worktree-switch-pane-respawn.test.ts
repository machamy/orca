import { describe, expect, it } from 'vitest'
import type { AppState } from '@/store/types'
import {
  findUnderpoweredTabIds,
  scheduleFollowSwitchPaneRespawn
} from './default-worktree-switch-pane-respawn'

const WORKTREE = 'repo::/promoted'
const OTHER = 'repo::/elsewhere'
const SPLIT_TAB = 'tab-split'
const WHOLE_TAB = 'tab-whole'
const DEAD_TAB = 'tab-dead'

function makeState(overrides: Partial<AppState>): AppState {
  return {
    tabsByWorktree: {},
    terminalLayoutsByTabId: {},
    ptyIdsByTabId: {},
    ...overrides
  } as AppState
}

const splitOfTwo = {
  root: {
    type: 'split' as const,
    direction: 'vertical' as const,
    first: { type: 'leaf' as const, leafId: 'leaf-a' },
    second: { type: 'leaf' as const, leafId: 'leaf-b' }
  },
  activeLeafId: null,
  expandedLeafId: null
}
const singleLeaf = {
  root: { type: 'leaf' as const, leafId: 'leaf-c' },
  activeLeafId: null,
  expandedLeafId: null
}

describe('findUnderpoweredTabIds', () => {
  it('finds a split tab that came back with fewer live PTYs than panes', () => {
    const state = makeState({
      tabsByWorktree: {
        [WORKTREE]: [{ id: SPLIT_TAB }, { id: WHOLE_TAB }] as never
      },
      terminalLayoutsByTabId: { [SPLIT_TAB]: splitOfTwo, [WHOLE_TAB]: splitOfTwo } as never,
      ptyIdsByTabId: { [SPLIT_TAB]: ['pty-1'], [WHOLE_TAB]: ['pty-2', 'pty-3'] }
    })

    expect(findUnderpoweredTabIds(state, [WORKTREE])).toEqual([SPLIT_TAB])
  })

  it('finds a single-pane tab left with no PTY at all', () => {
    const state = makeState({
      tabsByWorktree: { [WORKTREE]: [{ id: DEAD_TAB }] as never },
      terminalLayoutsByTabId: { [DEAD_TAB]: singleLeaf } as never,
      ptyIdsByTabId: {}
    })

    expect(findUnderpoweredTabIds(state, [WORKTREE])).toEqual([DEAD_TAB])
  })

  it('ignores worktrees outside the switch and tabs with no layout', () => {
    const state = makeState({
      tabsByWorktree: {
        [WORKTREE]: [{ id: 'tab-no-layout' }] as never,
        [OTHER]: [{ id: DEAD_TAB }] as never
      },
      terminalLayoutsByTabId: { [DEAD_TAB]: singleLeaf } as never,
      ptyIdsByTabId: {}
    })

    expect(findUnderpoweredTabIds(state, [WORKTREE])).toEqual([])
  })
})

describe('scheduleFollowSwitchPaneRespawn', () => {
  it('retries with growing delays and remounts only what is still short', () => {
    const live: Record<string, string[]> = { [SPLIT_TAB]: ['pty-1'] }
    const state = (): AppState =>
      makeState({
        tabsByWorktree: { [WORKTREE]: [{ id: SPLIT_TAB }] as never },
        terminalLayoutsByTabId: { [SPLIT_TAB]: splitOfTwo } as never,
        ptyIdsByTabId: live
      })
    const scheduled: { run: () => void; delayMs: number }[] = []
    const remounted: string[] = []

    scheduleFollowSwitchPaneRespawn([WORKTREE], {
      getState: state,
      remountTab: (tabId) => remounted.push(tabId),
      schedule: (run, delayMs) => {
        scheduled.push({ run, delayMs })
        return () => {}
      }
    })

    expect(scheduled.map((s) => s.delayMs)).toEqual([4_000, 12_000, 25_000, 45_000, 75_000])
    scheduled[0].run()
    expect(remounted).toEqual([SPLIT_TAB])
    // The remount brought the second pane back; later sweeps must be no-ops.
    live[SPLIT_TAB] = ['pty-1', 'pty-2']
    for (const entry of scheduled.slice(1)) {
      entry.run()
    }
    expect(remounted).toEqual([SPLIT_TAB])
  })

  it('cancels the previous switch\u2019s pending sweeps when a new one starts', () => {
    // A swap-back reuses BOTH worktree ids, so switch N\u2019s late sweeps land
    // inside switch N+1\u2019s sleep where every tab reads as short — they then
    // delete the bindings N+1 is about to reattach.
    const cancelled: number[] = []
    const makeDeps = (tag: number): Parameters<typeof scheduleFollowSwitchPaneRespawn>[1] => ({
      getState: () => makeState({}),
      remountTab: () => {},
      schedule: () => () => cancelled.push(tag)
    })

    scheduleFollowSwitchPaneRespawn([WORKTREE], makeDeps(1))
    expect(cancelled).toEqual([])
    scheduleFollowSwitchPaneRespawn([WORKTREE], makeDeps(2))

    // All five of switch 1's sweeps are cancelled; switch 2's stay pending.
    expect(cancelled).toEqual([1, 1, 1, 1, 1])
  })

  it('skips a sweep whose switch no longer owns the teardown', () => {
    const remounted: string[] = []
    const scheduled: { run: () => void }[] = []
    scheduleFollowSwitchPaneRespawn([WORKTREE], {
      getState: () =>
        makeState({
          tabsByWorktree: { [WORKTREE]: [{ id: SPLIT_TAB }] as never },
          terminalLayoutsByTabId: { [SPLIT_TAB]: splitOfTwo } as never,
          ptyIdsByTabId: { [SPLIT_TAB]: ['pty-1'] }
        }),
      remountTab: (tabId) => remounted.push(tabId),
      isOwned: () => false,
      schedule: (run) => {
        scheduled.push({ run })
        return () => {}
      }
    })

    for (const entry of scheduled) {
      entry.run()
    }
    expect(remounted).toEqual([])
  })

  it('schedules nothing when the switch touched no worktrees', () => {
    const scheduled: number[] = []
    scheduleFollowSwitchPaneRespawn([], {
      getState: () => makeState({}),
      remountTab: () => {},
      schedule: (_run, delayMs) => {
        scheduled.push(delayMs)
        return () => {}
      }
    })
    expect(scheduled).toEqual([])
  })
})
