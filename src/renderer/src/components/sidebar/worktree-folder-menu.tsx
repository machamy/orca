import React, { useCallback, useMemo, useState } from 'react'
import { FolderPlus, FolderSymlink } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
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
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { Repo } from '../../../../shared/repo-types'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { Worktree } from '../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import { ProjectGroupNameDialog } from './ProjectGroupNameDialog'
import { runWorktreeDelete } from './delete-worktree-flow'
import {
  convertWorktreeToFolder,
  getDirectWorktreeLineageChildren,
  getValidWorktreeLineageParent,
  unnestAndFileWorktreesIntoFolder
} from './worktree-folder-conversion'

/**
 * X1: every folder entry point rides the experimental toggle, and only git
 * projects have worktree folders (folder workspaces have no worktree list).
 */
export function shouldShowWorktreeFolderMenuItems(
  settings: { experimentalWorktreeFolders?: boolean } | null | undefined,
  repo: Pick<Repo, 'kind'> | null | undefined
): boolean {
  return settings?.experimentalWorktreeFolders === true && repo != null && isGitRepoKind(repo)
}

const EMPTY_REPOS: readonly Repo[] = []

/**
 * The repo row folder mutations target. The parent's `useRepoById` answers for
 * the ACTIVE workspace's host, so a right-click on an inactive host's row could
 * create a folder on another host's same-id repo. Resolve from the clicked
 * row's own host stamp instead; an unstamped row falls back to the focused-host
 * disambiguation the membership slice already uses.
 */
export function resolveWorktreeFolderMenuRepo(
  repos: readonly Repo[],
  worktree: Pick<Worktree, 'repoId' | 'hostId'>,
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): Repo | null {
  return findRepoForHost(repos, worktree.repoId, {
    hostId: worktree.hostId ?? undefined,
    settings
  })
}

/**
 * Fork E3a/E5: the per-worktree folder entries of the worktree context menu —
 * "New Folder from Workspace" (the zero-folder entry point: no folder row
 * exists yet to right-click, and `groupBy: none` has no project header) and
 * "Convert to Folder" for a lineage parent used as a folder stand-in.
 *
 * Extracted from WorktreeContextMenu.tsx so upstream rewrites of that file
 * merge around one hook call. Same contract as `useUnityWorktreeMenu`:
 * `lifecyclePending` must be OR-ed into the parent's lifecycle gate, because
 * the dialogs outlive the menu.
 */
export function useWorktreeFolderWorktreeMenu(args: {
  worktree: Worktree
  menuOpen: boolean
  isDeleting: boolean
  allWorktrees: readonly Worktree[]
  lineageById: Readonly<Record<string, WorktreeLineage>>
  cyclicLineageIds: ReadonlySet<string>
}): {
  menuItems: React.ReactNode
  dialogs: React.ReactNode
  lifecyclePending: boolean
} {
  const { worktree, menuOpen, isDeleting } = args
  const settings = useAppStore((s) => s.settings)
  // ?? sentinel: partial test stores omit `repos`; a fresh [] per render would defeat the memo.
  const repos = useAppStore((s) => s.repos ?? EMPTY_REPOS)
  const createWorktreeFolder = useAppStore((s) => s.createWorktreeFolder)
  const deleteWorktreeFolder = useAppStore((s) => s.deleteWorktreeFolder)
  const setWorktreeFolderMembership = useAppStore((s) => s.setWorktreeFolderMembership)
  const updateWorktreeLineage = useAppStore((s) => s.updateWorktreeLineage)
  const repo = useMemo(
    () => resolveWorktreeFolderMenuRepo(repos, worktree, settings),
    [repos, settings, worktree]
  )
  // The dialog outlives the menu, and the menu-gated lineage inputs empty on
  // close — so whether filing needs an un-nest is captured at item-select time.
  const [createDialog, setCreateDialog] = useState<{ requiresUnnest: boolean } | null>(null)
  const [converting, setConverting] = useState(false)
  const [deleteOffer, setDeleteOffer] = useState<{
    worktreeId: string
    instanceId?: string
    hostId?: Worktree['hostId']
    displayName: string
  } | null>(null)

  const enabled = shouldShowWorktreeFolderMenuItems(settings, repo)
  const directChildren = useMemo(
    () =>
      menuOpen && enabled
        ? getDirectWorktreeLineageChildren(
            worktree,
            args.allWorktrees,
            args.lineageById,
            args.cyclicLineageIds
          )
        : [],
    [args.allWorktrees, args.cyclicLineageIds, args.lineageById, enabled, menuOpen, worktree]
  )
  // Lineage child: its own membership is invisible (lineage wins in the
  // resolver), so "New Folder from Workspace" must un-nest before filing.
  const isLineageChild = useMemo(
    () =>
      menuOpen &&
      enabled &&
      getValidWorktreeLineageParent(
        worktree,
        args.allWorktrees,
        args.lineageById,
        args.cyclicLineageIds
      ) !== null,
    [args.allWorktrees, args.cyclicLineageIds, args.lineageById, enabled, menuOpen, worktree]
  )

  const handleCreateSubmit = useCallback(
    async (name: string) => {
      if (!repo) {
        return
      }
      const hostId = getRepoExecutionHostId(repo)
      const folder = await createWorktreeFolder(repo.id, { name }, { hostId })
      if (!folder) {
        // Capability/host refusals already toasted their reason; keep the dialog open.
        throw new Error('worktree folder create refused')
      }
      const result = await unnestAndFileWorktreesIntoFolder(
        { setWorktreeFolderMembership, updateWorktreeLineage },
        [{ id: worktree.id, requiresUnnest: createDialog?.requiresUnnest === true }],
        folder.id
      )
      if (!result.complete || !result.filed) {
        // Same contract as delete's unfile-first: no half-state survives a
        // failure. Membership failures toasted in the slice; un-nest here.
        if (!result.complete) {
          toast.error(
            translate(
              'auto.components.sidebar.worktreeFolderMenu.fileIntoFolderFailed',
              'Failed to move the workspace into the new folder'
            )
          )
        }
        await deleteWorktreeFolder(repo.id, folder.id, { hostId })
        throw new Error('worktree folder filing failed')
      }
    },
    [
      createDialog,
      createWorktreeFolder,
      deleteWorktreeFolder,
      repo,
      setWorktreeFolderMembership,
      updateWorktreeLineage,
      worktree.id
    ]
  )

  const handleConvert = useCallback(async () => {
    if (!repo || converting) {
      return
    }
    setConverting(true)
    try {
      const result = await convertWorktreeToFolder(
        { createWorktreeFolder, setWorktreeFolderMembership, updateWorktreeLineage },
        { worktree, repo, directChildren }
      )
      if (!result) {
        return
      }
      if (!result.complete) {
        // A partial conversion left children behind — the worktree is NOT
        // emptied, so deleting it must not be offered.
        toast.error(
          translate(
            'auto.components.sidebar.worktreeFolderMenu.convertPartial',
            'Some lineage children could not be moved into the folder'
          )
        )
        return
      }
      // The offer is a separate, explicitly-confirmed step — never auto-delete.
      setDeleteOffer({
        worktreeId: worktree.id,
        instanceId: worktree.instanceId,
        hostId: worktree.hostId,
        displayName: worktree.displayName
      })
    } finally {
      setConverting(false)
    }
  }, [
    converting,
    createWorktreeFolder,
    directChildren,
    repo,
    setWorktreeFolderMembership,
    updateWorktreeLineage,
    worktree
  ])

  const handleOfferedDelete = useCallback(() => {
    const offer = deleteOffer
    setDeleteOffer(null)
    if (!offer) {
      return
    }
    runWorktreeDelete(offer.worktreeId, {
      expectedInstanceId: offer.instanceId,
      ...(offer.hostId ? { expectedHostId: offer.hostId } : {})
    })
  }, [deleteOffer])

  const menuItems = enabled ? (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => setCreateDialog({ requiresUnnest: isLineageChild })}
        disabled={isDeleting}
      >
        <FolderPlus className="size-3.5" />
        {translate(
          'auto.components.sidebar.worktreeFolderMenu.newFolderFromWorkspace',
          'New Folder from Workspace…'
        )}
      </DropdownMenuItem>
      {directChildren.length > 0 ? (
        <DropdownMenuItem onSelect={handleConvert} disabled={isDeleting || converting}>
          <FolderSymlink className="size-3.5" />
          {translate(
            'auto.components.sidebar.worktreeFolderMenu.convertToFolder',
            'Convert to Folder…'
          )}
        </DropdownMenuItem>
      ) : null}
    </>
  ) : null

  const dialogs = enabled ? (
    <>
      <ProjectGroupNameDialog
        open={createDialog !== null}
        title={translate('auto.components.sidebar.worktreeFolderMenu.newFolderTitle', 'New Folder')}
        description={translate(
          'auto.components.sidebar.worktreeFolderMenu.newFolderDescription',
          'Create a folder and file this workspace into it.'
        )}
        inputLabel={translate(
          'auto.components.sidebar.worktreeFolderMenu.folderNameLabel',
          'Folder Name'
        )}
        initialName={worktree.displayName}
        confirmLabel={translate('auto.components.sidebar.worktreeFolderMenu.createLabel', 'Create')}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialog(null)
          }
        }}
        onSubmit={handleCreateSubmit}
      />
      <Dialog open={deleteOffer !== null} onOpenChange={(open) => !open && setDeleteOffer(null)}>
        <DialogContent className="max-w-sm sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {translate(
                'auto.components.sidebar.worktreeFolderMenu.offerDeleteTitle',
                'Delete the emptied worktree?'
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {translate(
                'auto.components.sidebar.worktreeFolderMenu.offerDeleteDescription',
                '{{name}} is now a folder and its children moved in. The old worktree is empty — you can delete it or keep it.',
                { name: deleteOffer?.displayName ?? '' }
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setDeleteOffer(null)}
            >
              {translate('auto.components.sidebar.worktreeFolderMenu.keepWorktree', 'Keep')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="text-xs"
              onClick={handleOfferedDelete}
            >
              {translate(
                'auto.components.sidebar.worktreeFolderMenu.deleteWorktree',
                'Delete Worktree…'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  ) : null

  return {
    menuItems,
    dialogs,
    lifecyclePending: createDialog !== null || converting || deleteOffer !== null
  }
}
