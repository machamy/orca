import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FileCode2, Gamepad2, HardDriveDownload } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useUnityWorktreeTintMenu } from './worktree-unity-tint-menu'
import { getRuntimePathBasename } from '../../../../shared/cross-platform-path'
import { isLocallyRunnableUnityRepo } from '../../../../shared/unity-repo-eligibility'
import {
  areRuntimePathsEqual,
  isDefaultCheckoutWorkspace
} from '../../../../shared/worktree/ownership'
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
  const [unitySeeding, setUnitySeeding] = useState(false)
  const [unityConfirmOpen, setUnityConfirmOpen] = useState(false)
  const markUnityProjectRepoDetected = useAppStore((store) => store.markUnityProjectRepoDetected)
  const unityEligible = (worktree.hostId ?? 'local') === 'local' && isLocallyRunnableUnityRepo(repo)
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
  // Fork: sibling folder names let the tint avoid handing two worktrees the same
  // colour — the whole point is telling two open editors apart. The repo-path
  // checkout is excluded: it stays Unity's default grey, so "no colour" reads as
  // "this is the default worktree" and it does not consume a palette slot.
  const unityTintSiblingWorktrees = useMemo(
    () =>
      allWorktrees
        .filter((candidate) => candidate.repoId === worktree.repoId)
        // Unity runs locally, so only local rows can collide over an editor tint;
        // SSH and runtime rows would otherwise eat palette slots for nothing.
        .filter((candidate) => (candidate.hostId ?? 'local') === 'local')
        .filter((candidate) => repoPath == null || !areRuntimePathsEqual(candidate.path, repoPath)),
    [allWorktrees, repoPath, worktree.repoId]
  )
  const unityTintSiblingLabels = useMemo(
    () =>
      unityTintSiblingWorktrees.map(
        (candidate) => getRuntimePathBasename(candidate.path) || candidate.path
      ),
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
  const openUnityNow = useCallback(async () => {
    const result = await window.api.unity.openProject({
      worktreePath: worktree.path,
      ...(repo
        ? {
            // false on the default row removes a tint left from an earlier run.
            tint: repo.unityWorktreeTint !== false && !isDefaultWorktreePath,
            tintSiblingLabels: unityTintSiblingLabels,
            ...(repo.unityTintOverrides ? { tintOverridesByLabel: repo.unityTintOverrides } : {})
          }
        : {})
    })
    if (result.opened) {
      return
    }
    if (result.reason === 'editor_missing') {
      toast.error(
        result.hubOpened
          ? translate(
              'auto.components.sidebar.WorktreeContextMenu.unityEditorMissing',
              'Unity {{version}} is not installed — opened Unity Hub instead',
              { version: result.editorVersion ?? '' }
            )
          : translate(
              'auto.components.sidebar.WorktreeContextMenu.unityEditorMissingNoHub',
              'Unity {{version}} is not installed. Install it via Unity Hub, then retry.',
              { version: result.editorVersion ?? '' }
            )
      )
      return
    }
    if (result.reason === 'launch_failed') {
      toast.error(
        translate(
          'auto.components.sidebar.WorktreeContextMenu.unityLaunchFailed',
          'Unity failed to launch: {{detail}}',
          { detail: result.detail ?? '' }
        )
      )
      return
    }
    if (result.reason === 'seed_in_progress') {
      toast.error(
        translate(
          'auto.components.sidebar.WorktreeContextMenu.unityOpenDuringSeed',
          'A Unity cache copy involving this project is still running — try again when it finishes'
        )
      )
      return
    }
    // The worktree vanished between the menu and the click (deleted elsewhere).
    toast.error(
      translate(
        'auto.components.sidebar.WorktreeContextMenu.unityNotAProject',
        'This folder no longer holds a Unity project'
      )
    )
  }, [repo, worktree.path, isDefaultWorktreePath, unityTintSiblingLabels])
  const handleRiderOpen = useCallback(async () => {
    const result = await window.api.unity.openInRider({
      worktreePath: worktree.path,
      ...(repo ? { sourcePath: repo.path } : {})
    })
    if (result.opened) {
      if (result.target === 'folder') {
        // No .sln anywhere yet — Rider got the folder; Unity's first open makes the real one.
        toast.info(
          translate(
            'auto.components.sidebar.WorktreeContextMenu.unityRiderFolderFallback',
            'No .sln yet — opened the folder in Rider. Open the project in Unity once to generate it.'
          )
        )
      }
      return
    }
    if (result.reason === 'rider_missing') {
      toast.error(
        translate(
          'auto.components.sidebar.WorktreeContextMenu.unityRiderMissing',
          'JetBrains Rider was not found in /Applications'
        )
      )
      return
    }
    if (result.reason === 'not_a_unity_project') {
      // The worktree vanished between the menu probe and the click.
      toast.error(
        translate(
          'auto.components.sidebar.WorktreeContextMenu.unityNotAProject',
          'This folder no longer holds a Unity project'
        )
      )
      return
    }
    toast.error(
      translate(
        'auto.components.sidebar.WorktreeContextMenu.unityRiderFailed',
        'Rider failed to launch: {{detail}}',
        { detail: ('detail' in result ? result.detail : undefined) ?? result.reason }
      )
    )
  }, [repo, worktree.path])
  const handleUnitySeed = useCallback(async (): Promise<boolean> => {
    if (!repo) {
      return false
    }
    setUnitySeeding(true)
    try {
      const result = await window.api.unity.seedWorktreeCache({
        worktreePath: worktree.path,
        sourcePath: repo.path,
        tint: repo.unityWorktreeTint !== false,
        tintSiblingLabels: unityTintSiblingLabels,
        ...(repo.unityTintOverrides ? { tintOverridesByLabel: repo.unityTintOverrides } : {})
      })
      if (result.seeded) {
        toast.success(
          translate(
            'auto.components.sidebar.WorktreeContextMenu.unitySeeded',
            'Unity cache copied — first open will skip the full reimport'
          )
        )
        markWorktreeLibrarySeeded()
        return true
      }
      if (result.reason === 'already_seeded') {
        // Someone else seeded between our menu probe and the click; the goal
        // state holds, and "Copy and Open" should still open.
        markWorktreeLibrarySeeded()
        return true
      }
      toast.error(
        translate(
          'auto.components.sidebar.WorktreeContextMenu.unitySeedFailed',
          'Could not copy the Unity cache ({{reason}})',
          {
            reason:
              result.reason + ('detail' in result && result.detail ? `: ${result.detail}` : '')
          }
        )
      )
      return false
    } finally {
      setUnitySeeding(false)
    }
  }, [repo, worktree.path, unityTintSiblingLabels, markWorktreeLibrarySeeded])
  const handleUnityOpen = useCallback(() => {
    // No cache yet but the default checkout has one: offer to copy it first,
    // so the first open is seconds instead of a full reimport. Declining opens
    // the project as-is.
    if (
      unityStatus &&
      !unityStatus.worktreeHasLibrary &&
      unityStatus.sourceHasLibrary &&
      !isDefaultWorktreePath
    ) {
      setUnityConfirmOpen(true)
      return
    }
    void openUnityNow()
  }, [unityStatus, isDefaultWorktreePath, openUnityNow])

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

  const confirmDialog = (
    <Dialog open={unityConfirmOpen} onOpenChange={setUnityConfirmOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.unityConfirmTitle',
              'Copy the Unity cache first?'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.unityConfirmBody',
              'This worktree has no Library yet, so Unity would reimport everything on first open. Copying the default worktree’s cache takes seconds and skips that.'
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setUnityConfirmOpen(false)
            }}
          >
            {translate('auto.components.sidebar.WorktreeContextMenu.unityConfirmCancel', 'Cancel')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setUnityConfirmOpen(false)
              void openUnityNow()
            }}
          >
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.unityConfirmOpenOnly',
              'Open Without Copying'
            )}
          </Button>
          <Button
            disabled={unitySeeding}
            onClick={() => {
              void (async () => {
                const seeded = await handleUnitySeed()
                setUnityConfirmOpen(false)
                if (seeded) {
                  void openUnityNow()
                }
              })()
            }}
          >
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.unityConfirmSeedOpen',
              'Copy and Open'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return {
    menuItems,
    confirmDialog: (
      <>
        {confirmDialog}
        {tintMenu.tintPickerDialog}
      </>
    ),
    // The dialogs (and an in-flight seed) outlive the menu; the parent's
    // lifecycle gate must not unmount the wrapper while any is live.
    lifecyclePending: unityConfirmOpen || unitySeeding || tintMenu.tintPickerOpen
  }
}
