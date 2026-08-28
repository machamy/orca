import React, { useCallback, useRef, useState } from 'react'
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
import type { WorktreeFolder } from '../../../../shared/worktree-folder/types'

export type WorktreeFolderDeletePlan = {
  folderName: string
  /** B8a: workspaces whose *stored* membership names this folder — hidden rows
   *  included, lineage-only visual members and descendant folders' members not. */
  rawDirectMemberCount: number
  childFolderNames: string[]
  /** Where child folders promote; null reads as top level. */
  promotionTargetName: string | null
}

export function buildWorktreeFolderDeletePlan(
  folders: readonly WorktreeFolder[],
  folderId: string,
  rawDirectMemberCount: number
): WorktreeFolderDeletePlan | null {
  const folder = folders.find((candidate) => candidate.id === folderId)
  if (!folder) {
    return null
  }
  const parent = folder.parentFolderId
    ? (folders.find((candidate) => candidate.id === folder.parentFolderId) ?? null)
    : null
  return {
    folderName: folder.name,
    rawDirectMemberCount,
    childFolderNames: folders
      .filter((candidate) => candidate.parentFolderId === folderId)
      .map((candidate) => candidate.name),
    promotionTargetName: parent?.name ?? null
  }
}

/** E4 copy, exported so tests judge the exact wording without opening the dialog. */
export function getWorktreeFolderDeleteDialogLines(plan: WorktreeFolderDeletePlan): string[] {
  const lines: string[] = []
  if (plan.rawDirectMemberCount === 1) {
    lines.push(
      translate(
        'auto.components.sidebar.WorktreeFolderDeleteDialog.memberSingular',
        '1 workspace moves out of this folder.'
      )
    )
  } else if (plan.rawDirectMemberCount > 1) {
    lines.push(
      translate(
        'auto.components.sidebar.WorktreeFolderDeleteDialog.memberPlural',
        '{{count}} workspaces move out of this folder.',
        { count: plan.rawDirectMemberCount }
      )
    )
  }
  if (plan.childFolderNames.length > 0) {
    const names = plan.childFolderNames.join(', ')
    lines.push(
      plan.promotionTargetName
        ? translate(
            'auto.components.sidebar.WorktreeFolderDeleteDialog.childrenPromoteInto',
            'Folders {{names}} move into “{{parent}}”.',
            { names, parent: plan.promotionTargetName }
          )
        : translate(
            'auto.components.sidebar.WorktreeFolderDeleteDialog.childrenPromoteTopLevel',
            'Folders {{names}} move to the top level.',
            { names }
          )
    )
  }
  lines.push(
    translate(
      'auto.components.sidebar.WorktreeFolderDeleteDialog.noWorkspaceDeleted',
      'No workspace is deleted.'
    )
  )
  return lines
}

type WorktreeFolderDeleteDialogProps = {
  open: boolean
  plan: WorktreeFolderDeletePlan | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void> | void
}

export function WorktreeFolderDeleteDialog({
  open,
  plan,
  onOpenChange,
  onConfirm
}: WorktreeFolderDeleteDialogProps): React.JSX.Element {
  const [deleting, setDeleting] = useState(false)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const mountedRef = useRef(true)

  const handleDialogContentRef = useCallback((node: HTMLDivElement | null): void => {
    mountedRef.current = node !== null
  }, [])

  const handleConfirm = useCallback(async () => {
    if (deleting) {
      return
    }
    setDeleting(true)
    try {
      await onConfirm()
      if (mountedRef.current) {
        setDeleting(false)
        onOpenChange(false)
      }
    } catch (error) {
      console.error('Failed to delete worktree folder:', error)
      if (mountedRef.current) {
        setDeleting(false)
      }
    }
  }, [deleting, onConfirm, onOpenChange])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && deleting) {
          return
        }
        if (!nextOpen) {
          setDeleting(false)
        }
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        ref={handleDialogContentRef}
        className="max-w-sm sm:max-w-sm"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          confirmButtonRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.sidebar.WorktreeFolderDeleteDialog.title', 'Delete Folder')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate('auto.components.sidebar.WorktreeFolderDeleteDialog.delete', 'Delete')}{' '}
            <span className="break-all font-medium text-foreground">{plan?.folderName ?? ''}</span>.
          </DialogDescription>
        </DialogHeader>
        {plan ? (
          <div className="space-y-1 text-xs text-foreground/85">
            {getWorktreeFolderDeleteDialogLines(plan).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            {translate('auto.components.sidebar.WorktreeFolderDeleteDialog.cancel', 'Cancel')}
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            variant="destructive"
            size="sm"
            className="text-xs"
            disabled={deleting || !plan}
            onClick={handleConfirm}
          >
            {deleting
              ? translate(
                  'auto.components.sidebar.WorktreeFolderDeleteDialog.deleting',
                  'Deleting...'
                )
              : translate(
                  'auto.components.sidebar.WorktreeFolderDeleteDialog.deleteFolder',
                  'Delete Folder'
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
