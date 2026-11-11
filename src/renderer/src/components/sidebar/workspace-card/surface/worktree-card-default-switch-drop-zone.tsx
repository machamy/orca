import React from 'react'
import { MonitorUp } from 'lucide-react'

import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'

/** Fork: the "Make default" zone the default row grows while an eligible drag is over the list. */
export function WorktreeCardDefaultSwitchDropZone({
  worktreeId,
  active
}: {
  worktreeId: string
  active: boolean
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <div
      data-default-worktree-switch-drop-target={worktreeId}
      className={cn(
        'absolute inset-x-1 top-0 z-20 flex h-[34%] min-h-6 items-center justify-center gap-1.5 rounded-t-md border-b text-[10px] font-medium',
        active
          ? 'border-worktree-sidebar-ring/50 bg-worktree-sidebar-accent text-foreground'
          : 'border-worktree-sidebar-border bg-worktree-sidebar/95 text-muted-foreground'
      )}
      aria-label={t(
        'auto.components.sidebar.WorktreeCard.defaultSwitchDropAriaLabel',
        'Move the selected worktree to the default project path'
      )}
    >
      <MonitorUp className="size-3" />
      {t('auto.components.sidebar.WorktreeCard.defaultSwitchDropLabel', 'Make default')}
    </div>
  )
}
