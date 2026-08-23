import { useEffect, useMemo } from 'react'

import { useAppStore } from '@/store'
import { useWorktreesForRepo } from '@/store/selectors'
import { getRuntimePathBasename } from '../../../../shared/cross-platform-path'
import { isLocallyRunnableUnityRepo } from '../../../../shared/unity-repo-eligibility'
import {
  getUnityWorktreeTintAssignment,
  pickUnityWorktreeTint
} from '../../../../shared/unity-worktree-tint-palette'
import { resolveUnitySidebarTintMode } from '../../../../shared/repo-types'
import {
  areRuntimePathsEqual,
  isDefaultCheckoutWorkspace
} from '../../../../shared/worktree/ownership'
import type { Repo, UnitySidebarTintMode } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'

/** `mode` is `'off'` exactly when `hex` is null, so a row can switch on it alone. */
export type WorktreeSidebarUnityTint = {
  hex: string | null
  mode: UnitySidebarTintMode
}

const NO_TINT: WorktreeSidebarUnityTint = { hex: null, mode: 'off' }

/**
 * Fork: the Unity worktree colour, resolved for one sidebar row.
 *
 * Kept apart from the indicator markup so the visual can be swapped without
 * touching the gates or the palette lookup. Returns no colour whenever the row
 * must show nothing at all.
 *
 * A hovered menu option previews its mode through the store slice, which wins
 * over the saved setting in both directions — including turning a row on for a
 * repo saved as 'off'. It does not win over the Unity gate: a preview may only
 * choose the shape of a colour the repo is entitled to.
 *
 * The sibling list must be built exactly like worktree-unity-menu.tsx does it
 * (same repo, local only, minus the repo-path checkout) — a different list
 * picks a different palette slot, and the row would then contradict the Unity
 * Toolbar Color menu.
 */
export function useWorktreeSidebarUnityTint(
  worktree: Worktree,
  repo: Repo | null | undefined
): WorktreeSidebarUnityTint {
  const repoPath = repo?.path
  const repoId = repo?.id ?? null
  // One repo's entry, not the record: a preview on repo A must leave repo B's
  // rows untouched, and this selector's result only moves for its own repo.
  // The `?.` covers sidebar tests that stand in a partial store state.
  const previewMode = useAppStore((state) =>
    repoId == null ? null : (state.unityTintSidebarPreviewByRepoId?.[repoId] ?? null)
  )
  const mode = previewMode ?? resolveUnitySidebarTintMode(repo?.unityTintInSidebar)
  // Every gate that costs nothing, settled before the filesystem is consulted:
  // a repo failing one of these must never trigger a probe.
  const wanted =
    repo != null &&
    mode !== 'off' &&
    repo.unityWorktreeTint !== false &&
    isLocallyRunnableUnityRepo(repo) &&
    // The default checkout keeps Unity's own grey toolbar, so it has no colour.
    !isDefaultCheckoutWorkspace(worktree, repo) &&
    (worktree.hostId ?? 'local') === 'local'
  const unityProbe = useAppStore((state) =>
    repoId == null ? null : (state.unityProjectRepoProbeByRepoId?.[repoId] ?? null)
  )
  const probeUnityProjectRepo = useAppStore((state) => state.probeUnityProjectRepo)
  // The slice answers once per repo however many rows ask, so a mount-time call
  // per row costs one IPC per repo — not one per row, and none per render.
  useEffect(() => {
    if (!wanted || repoId == null || repoPath == null) {
      return
    }
    probeUnityProjectRepo?.(repoId, repoPath)
  }, [wanted, repoId, repoPath, probeUnityProjectRepo])
  // The default is on, so a plain git repo would otherwise colour its rows.
  // While the answer is in flight the row shows nothing rather than guessing.
  const enabled =
    wanted && unityProbe != null && unityProbe.path === repoPath && unityProbe.state === 'yes'
  // Only this repo's rows, and only while the indicator is on: a sidebar row
  // must not re-render on every unrelated worktree change in the app.
  const repoWorktrees = useWorktreesForRepo(enabled ? repoId : null)
  const siblingLabels = useMemo(
    () =>
      repoWorktrees
        .filter((candidate) => candidate.repoId === worktree.repoId)
        .filter((candidate) => (candidate.hostId ?? 'local') === 'local')
        .filter((candidate) => repoPath == null || !areRuntimePathsEqual(candidate.path, repoPath))
        .map((candidate) => getRuntimePathBasename(candidate.path) || candidate.path),
    [repoWorktrees, repoPath, worktree.repoId]
  )
  const overrides = repo?.unityTintOverrides
  // No `|| path` fallback here: the menu keys the override map on the bare
  // basename, and the two must agree.
  const label = getRuntimePathBasename(worktree.path)
  return useMemo(() => {
    if (!enabled) {
      return NO_TINT
    }
    // The whole repo's assignment, not this row's cell: `pickUnityWorktreeTint`
    // rebuilds the entire table per call, and the sibling list gets a fresh
    // identity on every worktree store tick — N rows would each redo it.
    const hex = getUnityWorktreeTintAssignment(siblingLabels, overrides).get(label)?.hex
    return { hex: hex ?? pickUnityWorktreeTint(label, siblingLabels, overrides).hex, mode }
  }, [enabled, mode, label, siblingLabels, overrides])
}
