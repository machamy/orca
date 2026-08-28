import React, { useCallback, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, FolderInput, Pencil, Trash2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { WorktreeFolder } from '../../../../shared/worktree-folder/types'
import { compareWorktreeFolderSiblings } from '../../../../shared/worktree-folder/resolve'
import type { WorktreeFolderRow } from './worktree-list/grouping/row-types'
import { collectRawWorktreeFolderMemberIds } from '@/store/slices/worktree-folder-membership'
import { wouldCreateWorktreeFolderCycle } from '@/store/slices/worktree-folders'
import { ProjectGroupNameDialog } from './ProjectGroupNameDialog'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from './WorktreeContextMenu'
import {
  buildWorktreeFolderDeletePlan,
  WorktreeFolderDeleteDialog,
  type WorktreeFolderDeletePlan
} from './WorktreeFolderDeleteDialog'

/** Render-order sibling ids of one folder — the list Move Up/Down permutes. */
export function getWorktreeFolderSiblingIdsInRenderOrder(
  folders: readonly WorktreeFolder[],
  parentFolderId: string | null
): string[] {
  return folders
    .filter((folder) => (folder.parentFolderId ?? null) === parentFolderId)
    .sort(compareWorktreeFolderSiblings)
    .map((folder) => folder.id)
}

/** E3 nesting targets: everything except self, descendants (cycle refusal) and the current parent. */
export function getEligibleWorktreeFolderReparentTargets(
  folders: readonly WorktreeFolder[],
  folderId: string
): WorktreeFolder[] {
  const currentParentId = folders.find((folder) => folder.id === folderId)?.parentFolderId ?? null
  return folders
    .filter(
      (candidate) =>
        candidate.id !== folderId &&
        candidate.id !== currentParentId &&
        !wouldCreateWorktreeFolderCycle(folders, folderId, candidate.id)
    )
    .sort(compareWorktreeFolderSiblings)
}

/**
 * Fork E3: right-click menu chrome for a folder row — rename, sibling reorder,
 * nest into another folder, and the E4 delete confirmation. Lives outside the
 * row component so the row stays pure chrome; the trigger adds no box of its
 * own (`display: contents`) and therefore cannot disturb the virtual row's
 * absolute positioning or measurement. A real `ContextMenu` per the styleguide
 * (right-click invocation); opening broadcasts the sidebar's close-all event
 * so a hidden-trigger worktree menu can never stay open next to it.
 */
export function WorktreeFolderRowMenu({
  row,
  children
}: {
  row: WorktreeFolderRow
  children: React.ReactNode
}): React.JSX.Element {
  const renameWorktreeFolder = useAppStore((s) => s.renameWorktreeFolder)
  const deleteWorktreeFolder = useAppStore((s) => s.deleteWorktreeFolder)
  const reorderWorktreeFolders = useAppStore((s) => s.reorderWorktreeFolders)
  const reparentWorktreeFolder = useAppStore((s) => s.reparentWorktreeFolder)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deletePlan, setDeletePlan] = useState<WorktreeFolderDeletePlan | null>(null)

  const handleMenuOpenChange = useCallback((open: boolean) => {
    if (open) {
      // Same protocol as the worktree menus: at most one context menu open.
      window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
    }
    setMenuOpen(open)
  }, [])

  const repoId = row.repo.id
  const folderId = row.folder.id
  const writeOptions = useMemo(() => ({ hostId: row.hostId }), [row.hostId])
  const folders = useMemo(() => row.repo.worktreeFolders ?? [], [row.repo.worktreeFolders])
  const siblingIds = useMemo(
    () =>
      menuOpen
        ? getWorktreeFolderSiblingIdsInRenderOrder(folders, row.folder.parentFolderId ?? null)
        : [],
    [folders, menuOpen, row.folder.parentFolderId]
  )
  const siblingIndex = siblingIds.indexOf(folderId)
  const reparentTargets = useMemo(
    () => (menuOpen ? getEligibleWorktreeFolderReparentTargets(folders, folderId) : []),
    [folderId, folders, menuOpen]
  )

  const moveAmongSiblings = useCallback(
    (offset: -1 | 1) => {
      const index = siblingIds.indexOf(folderId)
      const swapWith = index + offset
      if (index === -1 || swapWith < 0 || swapWith >= siblingIds.length) {
        return
      }
      const next = [...siblingIds]
      next[index] = next[swapWith]
      next[swapWith] = folderId
      void reorderWorktreeFolders(repoId, next, writeOptions)
    },
    [folderId, reorderWorktreeFolders, repoId, siblingIds, writeOptions]
  )

  const handleRenameSubmit = useCallback(
    async (name: string) => {
      if (!(await renameWorktreeFolder(repoId, folderId, name, writeOptions))) {
        throw new Error('worktree folder rename refused')
      }
    },
    [folderId, renameWorktreeFolder, repoId, writeOptions]
  )

  const handleOpenDelete = useCallback(() => {
    // B8a: the dialog's N is raw stored membership, hidden rows included — not
    // the row's lineage-effective member count.
    const rawMemberCount = collectRawWorktreeFolderMemberIds(
      useAppStore.getState(),
      row.repo,
      folderId
    ).length
    setDeletePlan(buildWorktreeFolderDeletePlan(folders, folderId, rawMemberCount))
  }, [folderId, folders, row.repo])

  const handleDeleteConfirm = useCallback(async () => {
    if (!(await deleteWorktreeFolder(repoId, folderId, writeOptions))) {
      throw new Error('worktree folder delete refused')
    }
  }, [deleteWorktreeFolder, folderId, repoId, writeOptions])

  return (
    <>
      <ContextMenu onOpenChange={handleMenuOpenChange}>
        <ContextMenuTrigger asChild>
          <div className="contents">{children}</div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem onSelect={() => setRenameOpen(true)}>
            <Pencil className="size-3.5" />
            {translate('auto.components.sidebar.WorktreeFolderRowMenu.rename', 'Rename Folder…')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={siblingIndex <= 0} onSelect={() => moveAmongSiblings(-1)}>
            <ArrowUp className="size-3.5" />
            {translate('auto.components.sidebar.WorktreeFolderRowMenu.moveUp', 'Move Up')}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={siblingIndex === -1 || siblingIndex >= siblingIds.length - 1}
            onSelect={() => moveAmongSiblings(1)}
          >
            <ArrowDown className="size-3.5" />
            {translate('auto.components.sidebar.WorktreeFolderRowMenu.moveDown', 'Move Down')}
          </ContextMenuItem>
          {reparentTargets.length > 0 || row.folder.parentFolderId ? (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FolderInput className="size-3.5" />
                {translate(
                  'auto.components.sidebar.WorktreeFolderRowMenu.moveToFolder',
                  'Move to Folder'
                )}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {row.folder.parentFolderId ? (
                  <ContextMenuItem
                    onSelect={() =>
                      void reparentWorktreeFolder(repoId, folderId, null, writeOptions)
                    }
                  >
                    {translate(
                      'auto.components.sidebar.WorktreeFolderRowMenu.topLevel',
                      'Top Level'
                    )}
                  </ContextMenuItem>
                ) : null}
                {reparentTargets.map((target) => (
                  <ContextMenuItem
                    key={target.id}
                    onSelect={() =>
                      void reparentWorktreeFolder(repoId, folderId, target.id, writeOptions)
                    }
                  >
                    <span className="max-w-48 truncate">{target.name}</span>
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={handleOpenDelete}>
            <Trash2 className="size-3.5" />
            {translate('auto.components.sidebar.WorktreeFolderRowMenu.delete', 'Delete Folder…')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <ProjectGroupNameDialog
        open={renameOpen}
        title={translate(
          'auto.components.sidebar.WorktreeFolderRowMenu.renameTitle',
          'Rename Folder'
        )}
        description={translate(
          'auto.components.sidebar.WorktreeFolderRowMenu.renameDescription',
          'Rename this worktree folder.'
        )}
        inputLabel={translate(
          'auto.components.sidebar.WorktreeFolderRowMenu.folderNameLabel',
          'Folder Name'
        )}
        initialName={row.folder.name}
        confirmLabel={translate('auto.components.sidebar.WorktreeFolderRowMenu.save', 'Save')}
        onOpenChange={setRenameOpen}
        onSubmit={handleRenameSubmit}
      />
      <WorktreeFolderDeleteDialog
        open={deletePlan !== null}
        plan={deletePlan}
        onOpenChange={(open) => {
          if (!open) {
            setDeletePlan(null)
          }
        }}
        onConfirm={handleDeleteConfirm}
      />
    </>
  )
}
