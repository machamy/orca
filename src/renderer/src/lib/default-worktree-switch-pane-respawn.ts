// A follow switch tears every PTY down and rebuilds them, and the rebuild races
// its own teardown: a pane can reconnect while the sleep's kills are still
// landing, or spawn into the guard that protects the agents' resume records.
// Either way it ends up mounted with no PTY — invisible in the sidebar, blank
// in its split — and nothing retries it. Observed live: a 3-pane split coming
// back with one live pane, and a plain tab that never respawned on one side.
//
// So after the wake, sweep: any tab holding fewer live PTYs than its layout has
// panes gets remounted, which reattaches the live panes and spawns the dead
// ones. Runs a few times with growing delays because the losing races settle at
// different points, and a switch is rare enough to afford the retries.
import type { AppState } from '@/store/types'

// Observed live: a split pane occasionally lands after the 25s mark and only
// recovered on the NEXT switch's sweep. The switch is a rare, deliberate action
// and the sweep is a no-op once every tab is whole, so keep checking longer.
const SWEEP_DELAYS_MS = [4_000, 12_000, 25_000, 45_000, 75_000]

function countLayoutPanes(state: AppState, tabId: string): number {
  const root = state.terminalLayoutsByTabId[tabId]?.root
  const walk = (node: typeof root): number => {
    if (!node) {
      return 0
    }
    return node.type === 'split' ? walk(node.first) + walk(node.second) : 1
  }
  return walk(root)
}

/** Tabs whose live PTY count is short of their pane count. */
export function findUnderpoweredTabIds(state: AppState, worktreeIds: readonly string[]): string[] {
  const short: string[] = []
  for (const worktreeId of worktreeIds) {
    for (const tab of state.tabsByWorktree[worktreeId] ?? []) {
      const panes = countLayoutPanes(state, tab.id)
      if (panes === 0) {
        continue
      }
      const live = (state.ptyIdsByTabId[tab.id] ?? []).length
      if (live < panes) {
        short.push(tab.id)
      }
    }
  }
  return short
}

export type PaneRespawnSweepDeps = {
  getState: () => AppState
  remountTab: (tabId: string) => void
  onSweep?: (tabIds: readonly string[], attempt: number) => void
  /** Returns a canceller so a superseding switch can drop pending sweeps. */
  schedule?: (run: () => void, delayMs: number) => () => void
  /** True while the switch that scheduled a sweep still owns the teardown. */
  isOwned?: () => boolean
  /** Fired per worktree once its last sweep has run — recovery is done there. */
  onSweepsComplete?: (worktreeId: string) => void
  /** Fired when a sweep found nothing to repair: this side is already whole. */
  onSweepFoundNothing?: (worktreeId: string, attempt: number) => void
}

/** Pending sweeps keyed by the worktree they target. Why keyed rather than one
 *  global list: the ids are `repoId::path` and a swap-back reuses BOTH of them,
 *  so switch N's late sweeps land inside switch N+1's sleep, where every tab
 *  reads as short — they then delete the very PTY bindings N+1 is about to
 *  reattach and the sleep guard refuses the replacement spawn. A global list
 *  also let a switch in ANOTHER repo cancel these, stranding a recovery that
 *  nothing else would retry. A new switch cancels only its own worktrees. */
const pendingSweepCancelsByWorktreeId = new Map<string, (() => void)[]>()

export function cancelFollowSwitchPaneRespawn(worktreeIds?: readonly string[]): void {
  const keys = worktreeIds ?? [...pendingSweepCancelsByWorktreeId.keys()]
  for (const worktreeId of keys) {
    for (const cancel of pendingSweepCancelsByWorktreeId.get(worktreeId) ?? []) {
      cancel()
    }
    pendingSweepCancelsByWorktreeId.delete(worktreeId)
  }
}

export function scheduleFollowSwitchPaneRespawn(
  worktreeIds: readonly string[],
  deps: PaneRespawnSweepDeps
): void {
  cancelFollowSwitchPaneRespawn(worktreeIds)
  if (worktreeIds.length === 0) {
    return
  }
  const schedule =
    deps.schedule ??
    ((run, delayMs) => {
      const handle = setTimeout(run, delayMs)
      return () => clearTimeout(handle)
    })
  // Why one timer set PER worktree rather than one shared set for the switch:
  // with a shared set, cancelling worktree A also killed the timers of B, so a
  // later switch touching A alone stranded B's recovery — B's panes stayed
  // short of PTYs with nothing left to retry them.
  for (const worktreeId of worktreeIds) {
    const cancels = SWEEP_DELAYS_MS.map((delayMs, index) =>
      schedule(() => {
        // Why re-check ownership: a sweep that outlives its switch's teardown
        // window would remount panes whose exits are no longer suppressed, and
        // the resulting exit closes single-pane tabs outright.
        if (deps.isOwned && !deps.isOwned()) {
          return
        }
        const tabIds = findUnderpoweredTabIds(deps.getState(), [worktreeId])
        if (tabIds.length > 0) {
          deps.onSweep?.(tabIds, index + 1)
          for (const tabId of tabIds) {
            deps.remountTab(tabId)
          }
        } else {
          deps.onSweepFoundNothing?.(worktreeId, index + 1)
        }
        if (index === SWEEP_DELAYS_MS.length - 1) {
          // Recovery is over for this worktree, so the switch should stop owning
          // its teardown: past this point a suppressed exit is a REAL one (an
          // agent crashed, the user typed `exit`) and swallowing it leaves the
          // tab present but dead with no sweep left to repair it.
          // Per worktree, never gated on a shared counter: when a later switch
          // cancelled a sibling's timers the counter never reached zero and this
          // worktree kept swallowing real exits for the rest of its TTL.
          pendingSweepCancelsByWorktreeId.delete(worktreeId)
          deps.onSweepsComplete?.(worktreeId)
        }
      }, delayMs)
    )
    pendingSweepCancelsByWorktreeId.set(worktreeId, cancels)
  }
}
