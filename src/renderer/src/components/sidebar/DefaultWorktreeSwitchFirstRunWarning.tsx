import React from 'react'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'

/**
 * Shown once, before the first default-worktree switch.
 *
 * The feature is reversible but it surprises everyone the first time: it moves
 * BRANCHES, not folders, so a folder keeps its name while its branch changes
 * underneath. People navigate by folder name, and every confusion reported so
 * far started there — including uncommitted work appearing to vanish when it had
 * simply travelled with its branch.
 *
 * Deliberately no "don't show again" checkbox: it is shown once anyway, and a
 * checkbox is what people click instead of reading.
 */
export function DefaultWorktreeSwitchFirstRunWarning({
  onCancel,
  onAcknowledge
}: {
  onCancel: () => void
  onAcknowledge: () => void
}): React.JSX.Element {
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {translate(
            'auto.components.sidebar.DefaultWorktreeSwitchFirstRunWarning.title',
            'Switching the default worktree moves branches, not folders'
          )}
        </DialogTitle>
        <DialogDescription>
          {translate(
            'auto.components.sidebar.DefaultWorktreeSwitchFirstRunWarning.intro',
            'The two worktrees swap branches in place. No folder moves.'
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3 text-xs">
        <div className="min-w-0">
          <div className="font-medium text-foreground">
            {translate(
              'auto.components.sidebar.DefaultWorktreeSwitchFirstRunWarning.namesTitle',
              'Folder names stop matching branches'
            )}
          </div>
          <div className="text-muted-foreground">
            {translate(
              'auto.components.sidebar.DefaultWorktreeSwitchFirstRunWarning.namesBody',
              'A folder named after one branch can end up holding another. If you navigate by folder name, this is the part that confuses.'
            )}
          </div>
        </div>
        <div className="min-w-0">
          <div className="font-medium text-foreground">
            {translate(
              'auto.components.sidebar.DefaultWorktreeSwitchFirstRunWarning.changesTitle',
              'Uncommitted work travels with its branch'
            )}
          </div>
          <div className="text-muted-foreground">
            {translate(
              'auto.components.sidebar.DefaultWorktreeSwitchFirstRunWarning.changesBody',
              'Staged and untracked files move too, leaving the folder they are in now. Ignored files (build output, node_modules) stay put.'
            )}
          </div>
        </div>
        <div className="min-w-0">
          <div className="font-medium text-foreground">
            {translate(
              'auto.components.sidebar.DefaultWorktreeSwitchFirstRunWarning.toolsTitle',
              'Tools pointed at a path will see a different branch'
            )}
          </div>
          <div className="text-muted-foreground">
            {translate(
              'auto.components.sidebar.DefaultWorktreeSwitchFirstRunWarning.toolsBody',
              'Editors, GitHub Desktop and terminals left open on that folder follow the swap.'
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.sidebar.DefaultWorktreeSwitchFirstRunWarning.undo',
          'Run the same switch again to undo it.'
        )}
      </p>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {translate(
            'auto.components.sidebar.DefaultWorktreeSwitchFirstRunWarning.cancel',
            'Cancel'
          )}
        </Button>
        <Button onClick={onAcknowledge}>
          {translate(
            'auto.components.sidebar.DefaultWorktreeSwitchFirstRunWarning.acknowledge',
            'Got it, continue'
          )}
        </Button>
      </DialogFooter>
    </>
  )
}
