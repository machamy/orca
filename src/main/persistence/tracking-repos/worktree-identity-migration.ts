import {
  isDefaultSwitchTempWorktreeId,
  splitWorktreeIdForFilesystem
} from '../../../shared/worktree/id'
import { remapPathInsideWorktreeRoot } from '../../../shared/cross-platform-path'
import type { WorkspaceKey } from '../../../shared/folder-workspace-types'
import type { WorkspaceSessionState } from '../../../shared/workspace-session-state-types'
import { worktreeWorkspaceKey } from '../../../shared/workspace-scope'
import type { StoreOwnedPersistedState } from '../loading-store/store-owned-state'

/**
 * Re-keys every worktreeId-keyed record in `state` from `oldWorktreeId` to `newWorktreeId`. Mutates `state` in place;
 * returns whether anything changed so the caller can gate its save. No-op when the ids match.
 * See `Store.migrateWorktreeIdentity` for why the rename happens.
 */

/**
 * Fork (default-worktree switch): combine a re-key's incoming value with
 * whatever already sits at the destination. Overwriting is what a plain
 * assignment does, and for tab lists that silently destroyed the destination
 * worktree's tabs. Lists merge (by id where the entries have one); for
 * anything else the incoming value wins, the historical behaviour for scalars.
 */
function mergeReKeyedValue<T>(incoming: T, existing: T | undefined): T {
  if (existing === undefined || incoming === existing) {
    return incoming
  }
  if (!Array.isArray(incoming) || !Array.isArray(existing)) {
    return incoming
  }
  const merged = [...(existing as unknown[])]
  const seen = new Set(
    merged.map((entry) =>
      entry && typeof entry === 'object' && 'id' in entry
        ? String((entry as { id: unknown }).id)
        : entry
    )
  )
  for (const entry of incoming as unknown[]) {
    const key =
      entry && typeof entry === 'object' && 'id' in entry
        ? String((entry as { id: unknown }).id)
        : entry
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    merged.push(entry)
  }
  return merged as unknown as T
}

export function migrateWorktreeIdentity(
  state: StoreOwnedPersistedState,
  oldWorktreeId: string,
  newWorktreeId: string
): boolean {
  if (oldWorktreeId === newWorktreeId) {
    return false
  }
  const oldWorkspaceKey = worktreeWorkspaceKey(oldWorktreeId)
  const newWorkspaceKey = worktreeWorkspaceKey(newWorktreeId)
  const moveKey = <T>(
    record: Record<string, T>,
    mapValue: (value: T) => T = (value) => value
  ): boolean => {
    if (!(oldWorktreeId in record)) {
      return false
    }
    record[newWorktreeId] = mergeReKeyedValue(
      mapValue(record[oldWorktreeId]),
      record[newWorktreeId]
    )
    delete record[oldWorktreeId]
    return true
  }
  const withNewWorktreeId = <T extends { worktreeId: string }>(value: T): T =>
    value.worktreeId === oldWorktreeId ? { ...value, worktreeId: newWorktreeId } : value
  const migrateSession = (session: WorkspaceSessionState | undefined): boolean => {
    if (!session) {
      return false
    }
    let sessionChanged = false
    const moveSessionKey = <T>(
      record: Record<string, T> | undefined,
      mapValue: (value: T) => T = (value) => value
    ): boolean => {
      if (!record) {
        return false
      }
      let moved = false
      const pairs: [string, string][] = [
        [oldWorktreeId, newWorktreeId],
        [oldWorkspaceKey, newWorkspaceKey]
      ]
      for (const [oldKey, newKey] of pairs) {
        if (!(oldKey in record)) {
          continue
        }
        record[newKey] = mergeReKeyedValue(mapValue(record[oldKey]), record[newKey])
        delete record[oldKey]
        moved = true
      }
      return moved
    }

    // Fork: persisted tab startupCwd / open-file paths are absolute under the
    // old home; leaving them makes a restart hydrate the swapped workspace
    // pointing at the other checkout.
    const oldWorktreePath = splitWorktreeIdForFilesystem(oldWorktreeId)?.worktreePath
    const newWorktreePath = splitWorktreeIdForFilesystem(newWorktreeId)?.worktreePath
    const remapPathValue = (value: string): string =>
      oldWorktreePath && newWorktreePath
        ? (remapPathInsideWorktreeRoot(oldWorktreePath, newWorktreePath, value) ?? value)
        : value
    sessionChanged =
      moveSessionKey(session.tabsByWorktree, (tabs) =>
        tabs.map((tab) => {
          const moved = withNewWorktreeId(tab)
          return moved.startupCwd
            ? { ...moved, startupCwd: remapPathValue(moved.startupCwd) }
            : moved
        })
      ) || sessionChanged
    sessionChanged =
      moveSessionKey(session.openFilesByWorktree, (files) =>
        files.map((file) => {
          const moved = withNewWorktreeId(file)
          return moved.filePath ? { ...moved, filePath: remapPathValue(moved.filePath) } : moved
        })
      ) || sessionChanged
    // File ids derive from file paths, so the active pointer moves with them.
    sessionChanged =
      moveSessionKey(session.activeFileIdByWorktree, (fileId) =>
        fileId === null ? fileId : remapPathValue(fileId)
      ) || sessionChanged
    sessionChanged =
      moveSessionKey(session.browserTabsByWorktree, (workspaces) =>
        workspaces.map(withNewWorktreeId)
      ) || sessionChanged
    if (session.browserPagesByWorkspace) {
      let pagesChanged = false
      const nextPagesByWorkspace = { ...session.browserPagesByWorkspace }
      for (const [workspaceId, pages] of Object.entries(nextPagesByWorkspace)) {
        if (!pages.some((page) => page.worktreeId === oldWorktreeId)) {
          continue
        }
        nextPagesByWorkspace[workspaceId] = pages.map(withNewWorktreeId)
        pagesChanged = true
      }
      if (pagesChanged) {
        session.browserPagesByWorkspace = nextPagesByWorkspace
        sessionChanged = true
      }
    }
    sessionChanged = moveSessionKey(session.activeBrowserTabIdByWorktree) || sessionChanged
    sessionChanged = moveSessionKey(session.activeTabTypeByWorktree) || sessionChanged
    sessionChanged = moveSessionKey(session.activeTabIdByWorktree) || sessionChanged
    sessionChanged =
      moveSessionKey(session.unifiedTabs, (tabs) => tabs.map(withNewWorktreeId)) || sessionChanged
    sessionChanged =
      moveSessionKey(session.tabGroups, (groups) => groups.map(withNewWorktreeId)) || sessionChanged
    sessionChanged = moveSessionKey(session.tabGroupLayouts) || sessionChanged
    sessionChanged = moveSessionKey(session.activeGroupIdByWorktree) || sessionChanged
    sessionChanged = moveSessionKey(session.lastVisitedAtByWorktreeId) || sessionChanged
    sessionChanged =
      moveSessionKey(session.defaultTerminalTabsAppliedByWorktreeId) || sessionChanged
    if (session.activeWorktreeIdsOnShutdown?.includes(oldWorktreeId)) {
      session.activeWorktreeIdsOnShutdown = session.activeWorktreeIdsOnShutdown.map((id) =>
        id === oldWorktreeId ? newWorktreeId : id
      )
      sessionChanged = true
    }
    if (session.activeWorktreeId === oldWorktreeId) {
      session.activeWorktreeId = newWorktreeId
      sessionChanged = true
    }
    if (session.activeWorkspaceKey === oldWorkspaceKey) {
      session.activeWorkspaceKey = newWorkspaceKey
      sessionChanged = true
    }
    if (session.sleepingAgentSessionsByPaneKey) {
      let sleepingChanged = false
      const nextSleeping = { ...session.sleepingAgentSessionsByPaneKey }
      for (const [paneKey, record] of Object.entries(nextSleeping)) {
        if (record.worktreeId !== oldWorktreeId) {
          continue
        }
        nextSleeping[paneKey] = { ...record, worktreeId: newWorktreeId }
        sleepingChanged = true
      }
      if (sleepingChanged) {
        session.sleepingAgentSessionsByPaneKey = nextSleeping
        sessionChanged = true
      }
    }
    if (session.terminalSurfaceTombstonesByPaneKey) {
      let tombstonesChanged = false
      const nextTombstones = { ...session.terminalSurfaceTombstonesByPaneKey }
      for (const [paneKey, tombstone] of Object.entries(nextTombstones)) {
        if (tombstone.worktreeId !== oldWorktreeId) {
          continue
        }
        nextTombstones[paneKey] = { ...tombstone, worktreeId: newWorktreeId }
        tombstonesChanged = true
      }
      if (tombstonesChanged) {
        session.terminalSurfaceTombstonesByPaneKey = nextTombstones
        sessionChanged = true
      }
    }
    return sessionChanged
  }

  let changed = moveKey(state.worktreeMeta)
  // Record the prior id so a session minted under it isn't reaped as an orphan.
  const newMeta = state.worktreeMeta[newWorktreeId]
  if (newMeta) {
    const prior = newMeta.priorWorktreeIds ?? []
    // Fork: the default switch re-keys through a throwaway
    // `.orca-default-switch-<uuid>` id, so a plain dedupe can never match and
    // every switch appended one more entry — unbounded persisted growth. Temp
    // ids identify nothing after the swap; cap is a backstop, not a limit.
    const MAX_PRIOR_WORKTREE_IDS = 32
    const durable = prior.filter((id) => !isDefaultSwitchTempWorktreeId(id))
    if (!isDefaultSwitchTempWorktreeId(oldWorktreeId) && !durable.includes(oldWorktreeId)) {
      durable.push(oldWorktreeId)
    }
    const capped = durable.slice(-MAX_PRIOR_WORKTREE_IDS)
    if (capped.length !== prior.length || capped.some((id, index) => id !== prior[index])) {
      newMeta.priorWorktreeIds = capped
      changed = true
    }
  }

  // Fork: the renderer re-hydrates cleanup dismissals from here on startup; a
  // renderer-only remap would revert on restart.
  const cleanupDismissals = state.ui?.workspaceCleanup?.dismissals
  if (cleanupDismissals) {
    changed =
      moveKey(cleanupDismissals, (dismissal) => ({
        ...dismissal,
        worktreeId: newWorktreeId
      })) || changed
  }

  changed = moveKey(state.worktreeLineageById) || changed
  const movedLineage = state.worktreeLineageById[newWorktreeId]
  if (movedLineage && movedLineage.worktreeId === oldWorktreeId) {
    movedLineage.worktreeId = newWorktreeId
    // Why: moveKey reports nothing when the record already sat under the new key, so flag the repair
    // ourselves or the caller skips the save and the stale id comes back on reload.
    changed = true
  }
  // Why: children carry this as parentWorktreeId; keep the denormalized path-derived id consistent (parentWorktreeInstanceId is stable).
  for (const lineage of Object.values(state.worktreeLineageById)) {
    if (lineage.parentWorktreeId === oldWorktreeId) {
      lineage.parentWorktreeId = newWorktreeId
      changed = true
    }
  }

  if (oldWorkspaceKey in state.workspaceLineageByChildKey) {
    const lineage = state.workspaceLineageByChildKey[oldWorkspaceKey]
    state.workspaceLineageByChildKey[newWorkspaceKey] = {
      ...lineage,
      childWorkspaceKey: newWorkspaceKey
    }
    delete state.workspaceLineageByChildKey[oldWorkspaceKey]
    changed = true
  }
  for (const [childKey, lineage] of Object.entries(state.workspaceLineageByChildKey)) {
    if (lineage.parentWorkspaceKey === oldWorkspaceKey) {
      state.workspaceLineageByChildKey[childKey as WorkspaceKey] = {
        ...lineage,
        parentWorkspaceKey: newWorkspaceKey
      }
      changed = true
    }
  }

  changed = migrateSession(state.workspaceSession) || changed
  for (const session of Object.values(state.workspaceSessionsByHostId ?? {})) {
    changed = migrateSession(session) || changed
  }
  for (const selectionsByWorktree of Object.values(
    state.mobileClientTabSelectionsByDeviceId ?? {}
  )) {
    changed = moveKey(selectionsByWorktree) || changed
  }
  const showDotfiles = state.ui?.showDotfilesByWorktree
  if (showDotfiles) {
    changed = moveKey(showDotfiles) || changed
  }

  return changed
}
