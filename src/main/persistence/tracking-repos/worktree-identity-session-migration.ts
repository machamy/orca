import { splitWorktreeIdForFilesystem } from '../../../shared/worktree/id'
import { remapPathInsideWorktreeRoot } from '../../../shared/cross-platform-path'
import type { WorkspaceKey } from '../../../shared/folder-workspace-types'
import type { BrowserPage, BrowserWorkspace } from '../../../shared/browser-workspace-types'
import type { WorkspaceSessionState } from '../../../shared/workspace-session-state-types'
import {
  getWorktreeIdFromHostIdentity,
  isWorktreeHostIdentity
} from '../../../shared/worktree/host-qualified-identity'
import { mergeReKeyedValue } from './worktree-identity-rekey-merge'

/** The worktree rename, as everything inside one persisted workspace session needs it. */
export type WorktreeIdentityReKey = {
  oldWorktreeId: string
  newWorktreeId: string
  oldWorkspaceKey: WorkspaceKey
  newWorkspaceKey: WorkspaceKey
  withNewWorktreeId: <T extends { worktreeId: string }>(value: T) => T
  withNewBrowserWorktreeId: <T extends BrowserPage | BrowserWorkspace>(value: T) => T
}

/**
 * Re-keys one persisted workspace session onto the new worktree id. Split out of
 * `migrateWorktreeIdentity`, which applies it to the local session and to every
 * per-host session. Mutates `session`; returns whether anything moved.
 */
export function migrateWorkspaceSessionIdentity(
  session: WorkspaceSessionState | undefined,
  reKey: WorktreeIdentityReKey
): boolean {
  const {
    oldWorktreeId,
    newWorktreeId,
    oldWorkspaceKey,
    newWorkspaceKey,
    withNewWorktreeId,
    withNewBrowserWorktreeId
  } = reKey
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
        return moved.startupCwd ? { ...moved, startupCwd: remapPathValue(moved.startupCwd) } : moved
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
      workspaces.map(withNewBrowserWorktreeId)
    ) || sessionChanged
  if (session.browserPagesByWorkspace) {
    let pagesChanged = false
    const nextPagesByWorkspace = { ...session.browserPagesByWorkspace }
    for (const [workspaceId, pages] of Object.entries(nextPagesByWorkspace)) {
      if (
        !pages.some(
          (page) =>
            page.worktreeId === oldWorktreeId || page.docLocation?.worktreeId === oldWorktreeId
        )
      ) {
        continue
      }
      nextPagesByWorkspace[workspaceId] = pages.map(withNewBrowserWorktreeId)
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
  if (session.lastVisitedAtByWorktreeId) {
    const nextRecency = { ...session.lastVisitedAtByWorktreeId }
    let recencyChanged = false
    for (const [key, value] of Object.entries(session.lastVisitedAtByWorktreeId)) {
      const rawId = isWorktreeHostIdentity(key) ? getWorktreeIdFromHostIdentity(key) : key
      if (rawId !== oldWorktreeId) {
        continue
      }
      const nextKey = isWorktreeHostIdentity(key)
        ? `${key.slice(0, key.length - rawId.length)}${newWorktreeId}`
        : newWorktreeId
      // Why max: a partial migration leaves both identities behind; taking the older one would
      // regress Cmd+J recency after restart.
      const existing = nextRecency[nextKey]
      nextRecency[nextKey] = existing === undefined ? value : Math.max(existing, value)
      delete nextRecency[key]
      recencyChanged = true
    }
    if (recencyChanged) {
      session.lastVisitedAtByWorktreeId = nextRecency
      sessionChanged = true
    }
  }
  sessionChanged = moveSessionKey(session.defaultTerminalTabsAppliedByWorktreeId) || sessionChanged
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
