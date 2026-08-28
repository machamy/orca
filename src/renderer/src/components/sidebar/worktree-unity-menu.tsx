import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FileCode2, Gamepad2, HardDriveDownload } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  selectUnityTintSiblingWorktrees,
  unityTintSiblingLabelsOf
} from './unity-tint-sibling-worktrees'
import { useUnityWorktreeOpenActions } from './unity-worktree-open-actions'
import { useUnityWorktreeTintMenu } from './worktree-unity-tint-menu'
import { isLocallyRunnableUnityWorkspace } from '../../../../shared/unity-repo-eligibility'
import { isDefaultCheckoutWorkspace } from '../../../../shared/worktree/ownership'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { UnityWorktreeStatus } from '../../../../shared/unity-worktree'

/**
 * Fork: the per-worktree Unity entries of the worktree context menu — cache
 * seeding, "Open in Unity", "Open in Rider", and the seed-first confirm dialog.
 *
 * Extracted from WorktreeContextMenu.tsx so upstream rewrites of that file
 * merge around one hook call instead of ~400 fork lines. The contract with the
 * parent is deliberately explicit:
 *  - `menuOpen` drives the status probe (a handful of stats per open beats N
 *    probes per sidebar render), so the parent's open state is an input.
 *  - `lifecyclePending` must be OR-ed into the parent's onLifecycleComplete
 *    gate: the confirm dialog and an in-flight seed outlive the menu, and the
 *    Agent Map wrapper unmounting on menu close destroyed the dialog
 *    mid-question.
 *  - `allWorktrees` comes from the parent, which already subscribes for its
 *    lineage menu — taking it as an argument avoids a duplicate subscription.
 */
export function useUnityWorktreeMenu(args: {
  worktree: Worktree
  repo: Repo | null
  menuOpen: boolean
  isDeleting: boolean
  allWorktrees: readonly Worktree[]
}): {
  menuItems: React.ReactNode
  confirmDialog: React.ReactNode
  lifecyclePending: boolean
} {
  const { worktree, repo, menuOpen, isDeleting, allWorktrees } = args
  // Fork: a probe answers for one (worktree, source) pair, and the Agent Map
  // swaps that pair under a live hook — so the answer is stored with the pair it
  // describes and read back only for the current one. Without the key the new
  // target rendered the old worktree's menu until its own probe landed.
  const [probedUnityStatus, setProbedUnityStatus] = useState<{
    target: string
    status: UnityWorktreeStatus
  } | null>(null)
  const markUnityProjectRepoDetected = useAppStore((store) => store.markUnityProjectRepoDetected)
  const unityEligible = isLocallyRunnableUnityWorkspace(worktree, repo)
  const repoPath = repo?.path
  const isDefaultWorktreePath = isDefaultCheckoutWorkspace(worktree, repo)
  const unityProbeTarget = repo ? `${worktree.path}\u0000${repo.path}` : null
  const unityStatus =
    probedUnityStatus && probedUnityStatus.target === unityProbeTarget
      ? probedUnityStatus.status
      : null
  useEffect(() => {
    if (!menuOpen || !unityEligible || !repo || !unityProbeTarget) {
      return
    }
    let cancelled = false
    const repoId = repo.id
    const sourcePath = repo.path
    void window.api.unity
      .worktreeStatus({ worktreePath: worktree.path, sourcePath })
      .then((status) => {
        // Report even when cancelled: the sidebar tint caches one answer per
        // repo per session, and this probe re-validates it for free — a repo
        // that only just became a Unity project lights up from here.
        if (status.isUnityProject) {
          markUnityProjectRepoDetected?.(repoId, sourcePath)
        }
        if (!cancelled) {
          setProbedUnityStatus({ target: unityProbeTarget, status })
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [menuOpen, unityEligible, repo, worktree.path, unityProbeTarget, markUnityProjectRepoDetected])
  // Seeding proves the Library exists without re-probing — but only for the pair
  // that was seeded.
  const markWorktreeLibrarySeeded = useCallback(() => {
    setProbedUnityStatus((entry) =>
      entry?.target === unityProbeTarget
        ? { ...entry, status: { ...entry.status, worktreeHasLibrary: true } }
        : entry
    )
  }, [unityProbeTarget])
  const unityTintSiblingWorktrees = useMemo(
    () => selectUnityTintSiblingWorktrees(allWorktrees, worktree.repoId, repoPath),
    [allWorktrees, repoPath, worktree.repoId]
  )
  const unityTintSiblingLabels = useMemo(
    () => unityTintSiblingLabelsOf(unityTintSiblingWorktrees),
    [unityTintSiblingWorktrees]
  )
  const tintMenu = useUnityWorktreeTintMenu({
    worktree,
    repo,
    isDefaultWorktreePath,
    isDeleting,
    unityTintSiblingLabels,
    unityTintSiblingWorktrees
  })
  const unityActions = useUnityWorktreeOpenActions({
    worktree,
    repo,
    isDefaultWorktreePath,
    unityTintSiblingLabels,
    onSeeded: markWorktreeLibrarySeeded
  })
  const { handleRiderOpen, handleUnitySeed, requestUnityOpen } = unityActions
  const unitySeeding = unityActions.seeding
  const handleUnityOpen = useCallback(() => {
    requestUnityOpen(unityStatus)
  }, [requestUnityOpen, unityStatus])

  const menuItems =
    unityStatus?.isUnityProject && unityEligible ? (
      <>
        {!isDefaultWorktreePath ? (
          <DropdownMenuItem
            onSelect={() => {
              void handleUnitySeed()
            }}
            disabled={
              isDeleting ||
              unitySeeding ||
              unityStatus.worktreeHasLibrary ||
              !unityStatus.sourceHasLibrary
            }
          >
            <HardDriveDownload className="size-3.5" />
            {unityStatus.worktreeHasLibrary
              ? translate(
                  'auto.components.sidebar.WorktreeContextMenu.unityCachePresent',
                  'Unity Cache Already Present'
                )
              : translate(
                  'auto.components.sidebar.WorktreeContextMenu.unitySeed',
                  'Copy Unity Cache (from Default)'
                )}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={handleUnityOpen} disabled={isDeleting || unitySeeding}>
          <Gamepad2 className="size-3.5" />
          {translate('auto.components.sidebar.WorktreeContextMenu.unityOpen', 'Open in Unity')}
        </DropdownMenuItem>
        {unityStatus.riderInstalled ? (
          <DropdownMenuItem
            onSelect={() => {
              void handleRiderOpen()
            }}
            disabled={isDeleting || unitySeeding}
          >
            <FileCode2 className="size-3.5" />
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.unityRiderOpen',
              'Open in Rider'
            )}
          </DropdownMenuItem>
        ) : null}
        {tintMenu.tintMenuItems}
      </>
    ) : null

  return {
    menuItems,
    confirmDialog: (
      <>
        {unityActions.confirmDialog}
        {tintMenu.tintPickerDialog}
      </>
    ),
    // The dialogs (and an in-flight seed) outlive the menu; the parent's
    // lifecycle gate must not unmount the wrapper while any is live.
    lifecyclePending: unityActions.confirmOpen || unitySeeding || tintMenu.tintPickerOpen
  }
}
