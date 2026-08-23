import React, { useCallback } from 'react'
import { SquareTerminal } from 'lucide-react'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { translate } from '@/i18n/i18n'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'

const TERMINAL_TAB_ROW_CAP = 4

/** Muted rows for terminal tabs without an agent row, so open windows stay
 *  discoverable from the sidebar; click activates the workspace + tab. */
export const WorktreeCardTerminalTabRows = React.memo(function WorktreeCardTerminalTabRows({
  worktreeId,
  tabs
}: {
  worktreeId: string
  tabs: readonly TerminalTab[]
}) {
  const handleOpenTab = useCallback(
    (tabId: string) => {
      activateAndRevealWorktree(worktreeId)
      activateTabAndFocusPane(tabId, null)
    },
    [worktreeId]
  )
  if (tabs.length === 0) {
    return null
  }
  const visible = tabs.slice(0, TERMINAL_TAB_ROW_CAP)
  const overflow = tabs.length - visible.length
  return (
    <div>
      {visible.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => handleOpenTab(tab.id)}
          className="flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          title={tab.customTitle ?? tab.title}
        >
          <SquareTerminal className="size-3 shrink-0" />
          <span className="truncate">{tab.customTitle ?? tab.title}</span>
        </button>
      ))}
      {overflow > 0 ? (
        <div className="px-2 py-0.5 text-xs text-muted-foreground/70">
          {translate(
            'auto.components.sidebar.WorktreeCardAgents.moreTerminals',
            '+{{count}} more',
            {
              count: overflow
            }
          )}
        </div>
      ) : null}
    </div>
  )
})
