import React from 'react'
import { ChevronDown, Folder, FolderOpen } from 'lucide-react'
import type { VirtualItem } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'
import type { WorktreeFolderRow, WorktreeGroupBy } from '../grouping/row-types'
import { getVirtualRowTransform } from '../viewport/virtual-rows'
import { getWorktreeFolderRowContentIndent } from './indentation'

/**
 * Fork: chrome for a worktree folder — a container inside the tree, not a
 * workspace. Deliberately no card surface, shadow, border, Unity colour, or
 * option id: `getRenderRowOptionId` returns undefined for it, so it can never
 * take `aria-activedescendant` or keyboard cycling (D3), and with no `Worktree`
 * behind it nothing can activate, open a terminal, or grow agent rows (D4).
 */
export function renderWorktreeFolderVirtualRow(args: {
  row: WorktreeFolderRow
  vItem: VirtualItem
  groupBy: WorktreeGroupBy
  measureVirtualRowElement: (element: HTMLDivElement | null) => void
  onToggle: () => void
}): React.JSX.Element {
  const { row, vItem } = args
  const paddingLeft = getWorktreeFolderRowContentIndent({
    isGrouped: args.groupBy !== 'none',
    groupDepth: row.groupDepth,
    folderDepth: row.folderDepth
  })
  const FolderIcon = row.collapsed ? Folder : FolderOpen
  return (
    <div
      key={vItem.key}
      role="presentation"
      data-worktree-virtual-row
      data-worktree-virtual-row-key={String(vItem.key)}
      data-worktree-virtual-row-start={vItem.start}
      data-index={vItem.index}
      ref={args.measureVirtualRowElement}
      className="absolute left-0 right-0 top-0"
      style={{ transform: getVirtualRowTransform(vItem.start) }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!row.collapsed}
        aria-label={row.folder.name}
        data-worktree-folder-row
        data-worktree-folder-id={row.folder.id}
        data-worktree-section-key={row.sectionKey}
        className={cn(
          'group flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md pr-2 text-left',
          'transition-colors hover:bg-worktree-sidebar-accent'
        )}
        style={{ paddingLeft }}
        onClick={args.onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            // Why: the viewport container's Enter handler focuses xterm's helper textarea.
            event.stopPropagation()
            args.onToggle()
          }
        }}
      >
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            row.collapsed && '-rotate-90'
          )}
        />
        <FolderIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[13px] leading-none text-muted-foreground">
          {row.folder.name}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums leading-none text-muted-foreground/70">
          {row.memberCount}
        </span>
      </div>
    </div>
  )
}
