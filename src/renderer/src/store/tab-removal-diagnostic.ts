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
  // Why lazily: this installs from inside the store initializer, where
  // `getState()` still returns undefined — reading it there threw and took the
  // whole store down, leaving the runtime stuck at `graph_not_ready`.
  let previous: Set<string> | null = null
  api.subscribe((state) => {
    if (previous === null) {
      previous = collectTabIds(state)
      return
    }
    // Why sets and not sizes: a swap rewrites `tabsByWorktree` wholesale, so a
    // dropped tab can be masked by an added one in the same update. Comparing
    // counts missed exactly that case.
    const seen: Set<string> = previous
    const next = collectTabIds(state)
    const removed = [...seen].filter((id) => !next.has(id))
    previous = next
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
