import type { StoreApi } from 'zustand'
import { recordRendererCrashBreadcrumb } from '@/lib/crash-breadcrumb-recorder'
import type { AppState } from './types'

/**
 * TEMP diagnostic: name whatever removes a terminal tab.
 *
 * A codex tab has repeatedly vanished during a default-worktree switch with no
 * trace — every breadcrumbed removal path (closeTab, orphan sweep, worktree
 * purge, identity re-key, hydration drops) stayed silent while the tab and its
 * layout disappeared from `tabsByWorktree`. Auditing call sites has not found
 * it, so watch the state itself: zustand notifies subscribers synchronously
 * inside `setState`, which puts the mutating caller on this listener's stack.
 */
function collectTabIds(state: AppState | undefined): Set<string> {
  const ids = new Set<string>()
  for (const tabs of Object.values(state?.tabsByWorktree ?? {})) {
    for (const tab of tabs ?? []) {
      ids.add(tab.id)
    }
  }
  return ids
}

export function installTabRemovalDiagnostic(api: StoreApi<AppState>): void {
  api.subscribe((state, prevState) => {
    // Why only mid-switch: the vanishing tab was only ever seen there, and walking every tab on
    // each tab-map update broke the store's per-update read budget.
    if (state?.tabsByWorktree === prevState?.tabsByWorktree || !state?.defaultSwitchInFlight) {
      return
    }
    // Why sets and not sizes: a swap rewrites `tabsByWorktree` wholesale, so a
    // dropped tab can be masked by an added one in the same update.
    const next = collectTabIds(state)
    const removed = [...collectTabIds(prevState)].filter((id) => !next.has(id))
    if (removed.length === 0) {
      return
    }
    recordRendererCrashBreadcrumb('tab_vanished', {
      tabs: removed.map((id) => id.slice(0, 8)).join(','),
      remaining: next.size,
      stack: String(new Error('tab-removal-diagnostic').stack ?? '')
        .split('\n')
        .slice(2, 9)
        .map((line) => line.trim().replace(/^at /, ''))
        .join(' < ')
        .slice(0, 600)
    })
  })
}
