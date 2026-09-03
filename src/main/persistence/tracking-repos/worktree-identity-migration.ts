import {
  isDefaultSwitchTempWorktreeId,
  splitWorktreeIdForFilesystem
} from '../../../shared/worktree/id'
import type { WorkspaceKey } from '../../../shared/folder-workspace-types'
import type { BrowserPage, BrowserWorkspace } from '../../../shared/browser-workspace-types'
import { remapBrowserPageDocLocation } from '../../../shared/browser-page-doc-location'
import { worktreeWorkspaceKey } from '../../../shared/workspace-scope'
import type { PersistedState } from '../../../shared/persisted-state-types'
import { mergeReKeyedValue } from './worktree-identity-rekey-merge'
import { migrateWorkspaceSessionIdentity } from './worktree-identity-session-migration'

/**
 * Re-keys every worktreeId-keyed record in `state` from `oldWorktreeId` to `newWorktreeId`. Mutates `state` in place;
 * returns whether anything changed so the caller can gate its save. No-op when the ids match.
 * See `Store.migrateWorktreeIdentity` for why the rename happens.
 */

export function migrateWorktreeIdentity(
  state: PersistedState,
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
  const oldWorktreePath = splitWorktreeIdForFilesystem(oldWorktreeId)?.worktreePath
  const newWorktreePath = splitWorktreeIdForFilesystem(newWorktreeId)?.worktreePath
  const withNewBrowserWorktreeId = <T extends BrowserPage | BrowserWorkspace>(value: T): T => {
    const renamedValue = withNewWorktreeId(value)
    return value.docLocation?.worktreeId === oldWorktreeId
      ? {
          ...renamedValue,
          docLocation: remapBrowserPageDocLocation(
            value.docLocation,
            oldWorktreeId,
            newWorktreeId,
            oldWorktreePath,
            newWorktreePath
          )
        }
      : renamedValue
  }
  const reKey = {
    oldWorktreeId,
    newWorktreeId,
    oldWorkspaceKey,
    newWorkspaceKey,
    withNewWorktreeId,
    withNewBrowserWorktreeId
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

  changed = migrateWorkspaceSessionIdentity(state.workspaceSession, reKey) || changed
  for (const session of Object.values(state.workspaceSessionsByHostId ?? {})) {
    changed = migrateWorkspaceSessionIdentity(session, reKey) || changed
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
