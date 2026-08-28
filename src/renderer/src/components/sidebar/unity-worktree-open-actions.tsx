import React, { useCallback, useState } from 'react'
import { toast } from 'sonner'
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
import { shouldOfferUnityCacheCopy } from './unity-cache-copy-offer'
import { unityFocusFailureMessage } from './unity-focus-failure-message'
import type { Repo } from '../../../../shared/repo-types'
import type { UnityWorktreeStatus } from '../../../../shared/unity-worktree'
import type { Worktree } from '../../../../shared/worktree/types'

/**
 * Fork: the "Open in Unity" / "Open in Rider" / "Copy Unity Cache" actions and
 * the seed-first confirm dialog, with no menu attached.
 *
 * Extracted from the worktree context menu so the keyboard shortcuts drive the
 * exact same code. The shortcut cannot reuse the menu's `unityStatus` (that
 * probe only runs while the menu is open), so `requestUnityOpen` takes the
 * status it should decide on — pass the freshly probed one from a shortcut, the
 * menu's cached one from a menu click.
 */
export type UnityWorktreeOpenActions = {
  openUnityNow: () => Promise<void>
  handleRiderOpen: () => Promise<void>
  handleUnitySeed: () => Promise<boolean>
  /** Offers the cache copy first when it would help, otherwise opens. */
  requestUnityOpen: (status: UnityWorktreeStatus | null) => void
  confirmDialog: React.ReactNode
  seeding: boolean
  confirmOpen: boolean
}

export function useUnityWorktreeOpenActions(args: {
  worktree: Worktree
  repo: Repo | null
  isDefaultWorktreePath: boolean
  unityTintSiblingLabels: readonly string[]
  /** Lets the menu keep its cached probe in sync after a seed. */
  onSeeded?: () => void
}): UnityWorktreeOpenActions {
  const { worktree, repo, isDefaultWorktreePath, unityTintSiblingLabels, onSeeded } = args
  const [seeding, setSeeding] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const openUnityNow = useCallback(async () => {
    const result = await window.api.unity.openProject({
      worktreePath: worktree.path,
      ...(repo
        ? {
            // false on the default row removes a tint left from an earlier run.
            tint: repo.unityWorktreeTint !== false && !isDefaultWorktreePath,
            tintSiblingLabels: [...unityTintSiblingLabels],
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
    if (result.reason === 'focus_failed') {
      // The pid appears in every variant — Orca refuses to raise an arbitrary
      // Unity window, so the user has to find this one. The CAUSE varies, and
      // calling a missing xdotool or a refused foreground change a permission
      // problem would overclaim (STYLEGUIDE: UI copy must not overclaim).
      toast.error(
        unityFocusFailureMessage(result.editorPid, result.focusFailureReason, result.detail)
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
    setSeeding(true)
    try {
      const result = await window.api.unity.seedWorktreeCache({
        worktreePath: worktree.path,
        sourcePath: repo.path,
        tint: repo.unityWorktreeTint !== false,
        tintSiblingLabels: [...unityTintSiblingLabels],
        ...(repo.unityTintOverrides ? { tintOverridesByLabel: repo.unityTintOverrides } : {})
      })
      if (result.seeded) {
        toast.success(
          translate(
            'auto.components.sidebar.WorktreeContextMenu.unitySeeded',
            'Unity cache copied — first open will skip the full reimport'
          )
        )
        onSeeded?.()
        return true
      }
      if (result.reason === 'already_seeded') {
        // Someone else seeded between our menu probe and the click; the goal
        // state holds, and "Copy and Open" should still open.
        onSeeded?.()
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
      setSeeding(false)
    }
  }, [repo, worktree.path, unityTintSiblingLabels, onSeeded])

  const requestUnityOpen = useCallback(
    (status: UnityWorktreeStatus | null) => {
      // Declining the offer opens the project as-is.
      if (shouldOfferUnityCacheCopy(status, isDefaultWorktreePath)) {
        setConfirmOpen(true)
        return
      }
      void openUnityNow()
    },
    [isDefaultWorktreePath, openUnityNow]
  )

  const confirmDialog = (
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
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
              setConfirmOpen(false)
            }}
          >
            {translate('auto.components.sidebar.WorktreeContextMenu.unityConfirmCancel', 'Cancel')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setConfirmOpen(false)
              void openUnityNow()
            }}
          >
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.unityConfirmOpenOnly',
              'Open Without Copying'
            )}
          </Button>
          <Button
            disabled={seeding}
            onClick={() => {
              void (async () => {
                const seeded = await handleUnitySeed()
                setConfirmOpen(false)
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
    openUnityNow,
    handleRiderOpen,
    handleUnitySeed,
    requestUnityOpen,
    confirmDialog,
    seeding,
    confirmOpen
  }
}
