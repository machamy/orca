import React from 'react'
import { MonitorUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { useTranslate } from '@/i18n/use-translate'

/** Fork: marks the repo-path checkout, which a default-worktree switch can move between rows. */
export function WorktreeCardDefaultBadge(): React.JSX.Element {
  const t = useTranslate()
  return (
    <Badge
      variant="secondary"
      className="h-[16px] shrink-0 gap-1 rounded border border-worktree-sidebar-border px-1.5 text-[10px] font-medium"
    >
      <MonitorUp className="size-2.5" />
      {t('auto.components.sidebar.WorktreeCard.defaultWorktree', 'Default')}
    </Badge>
  )
}
