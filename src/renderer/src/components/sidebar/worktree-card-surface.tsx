import React from 'react'
import { LoaderCircle, MonitorUp } from 'lucide-react'
import { translate } from '@/i18n/i18n'

import { cn } from '@/lib/utils'
import { AutoRenameFailedDialog } from './AutoRenameFailedDialog'
import WorktreeContextMenu from './WorktreeContextMenu'
import { useIsSleepingWorktree } from './use-worktree-sleep-state'
import { WorktreeCardParentContent } from './worktree-card-parent-content'
import { buildWorktreeCardPresentation } from './worktree-card-presentation'
import { WorktreeCardUnityTint } from './worktree-card-unity-tint'
import { useWorktreeSidebarUnityTint } from './use-worktree-sidebar-unity-tint'
import type { WorktreeCardController } from './use-worktree-card-controller'

export function WorktreeCardSurface({ card }: { card: WorktreeCardController }): React.JSX.Element {
  const presentation = buildWorktreeCardPresentation(card)
  // Passing no repo is exactly "this surface has no Unity colour": no probe, no
  // store slicing, nothing drawn — the kanban tile and the folder-workspace
  // panel opt out because neither has the row geometry or the menu to change it.
  const { hex: unityTintHex, mode: unityTintMode } = useWorktreeSidebarUnityTint(
    card.worktree,
    card.showUnityTint ? card.repo : null
  )
  const {
    worktree,
    selectedWorktrees,
    onAssignWorkspaceStatus,
    onDefaultSwitchRequest,
    affiliateListMode,
    isActiveSurface,
    activeSurfaceVariant,
    isMultiSelected,
    revealHighlight,
    revealHighlightTone,
    flushSurface,
    isLineageDropTarget,
    showDefaultSwitchDropTarget,
    isDefaultSwitchDropTarget,
    nativeDragEnabled,
    lineageChildren,
    lineageChildrenStyle,
    newCardStyle,
    titleRenaming,
    isDeleting,
    isRuntimeDisconnected,
    isQueuedForDeletion,
    deleteLabel,
    handleClick,
    handleDoubleClick,
    handleDragStart,
    handleDragEnd,
    handleContextMenuSelect,
    showRenameErrorDialog,
    setShowRenameErrorDialog
  } = card
  const { titleOnlyCard, cardStyle } = presentation
  const isSleeping = useIsSleepingWorktree(worktree.id)

  const parentCardContent = <WorktreeCardParentContent card={card} presentation={presentation} />

  const cardBody = (
    <div
      className={cn(
        'relative flex cursor-pointer flex-col pr-1.5 transition-[background-color,border-color,opacity,box-shadow] duration-200 outline-none select-none',
        titleOnlyCard ? 'py-2' : 'pt-1.25 pb-1.5',
        flushSurface ? 'ml-1 w-[calc(100%-0.25rem)]' : 'ml-1',
        'rounded-lg',
        // Why: the live data attribute updates before React state during navigation,
        // so it must own the complete active style without stale utility classes.
        isDefaultSwitchDropTarget
          ? 'border border-worktree-sidebar-ring/50 bg-worktree-sidebar-accent ring-1 ring-worktree-sidebar-ring/40'
          : isLineageDropTarget
          ? 'border border-worktree-sidebar-foreground/40 bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground ring-1 ring-inset ring-worktree-sidebar-ring/60'
          : isActiveSurface
            ? 'border border-transparent'
            : isMultiSelected
              ? 'border border-worktree-sidebar-ring/35 bg-worktree-sidebar-accent/70 ring-1 ring-worktree-sidebar-ring/30'
              : 'border border-transparent worktree-sidebar-card-hover',
        isActiveSurface && isMultiSelected && 'ring-1 ring-worktree-sidebar-ring/35',
        // Why: the wash sits at -z-10 so the row's glyphs stay above it; without a
        // stacking context here it would drop behind the sidebar and disappear.
        unityTintMode === 'wash' && 'isolate',
        revealHighlight && [
          'scroll-to-current-workspace-reveal-highlight',
          revealHighlightTone === 'ai' && 'scroll-to-current-workspace-reveal-highlight--ai'
        ],
        titleRenaming && '!border-transparent !bg-transparent !shadow-none !ring-0',
        isDeleting && 'opacity-50 grayscale cursor-not-allowed',
        // Why: sleep dim carries the awake/sleeping distinction in new-card style,
        // where quiet statuses share the branch/PR lane (#19624). Same token as
        // the disconnected dim; legacy keeps its green/gray dots untouched.
        // Why: no SSH dim — the inline host control now states the disconnected state
        // explicitly, and a subtree opacity would composite its destructive tint and spinner
        // down to an illegible alpha (a descendant cannot escape an ancestor's opacity).
        isRuntimeDisconnected && !isDeleting && 'opacity-60'
      )}
      data-worktree-card-surface="true"
      data-worktree-card-active={
        isActiveSurface && !isLineageDropTarget ? activeSurfaceVariant : undefined
      }
      data-worktree-lineage-drop-target={isLineageDropTarget || undefined}
      onClick={handleClick}
      onDoubleClick={affiliateListMode ? undefined : handleDoubleClick}
      draggable={!affiliateListMode && nativeDragEnabled && !isDeleting && !titleRenaming}
      onDragStart={!affiliateListMode && nativeDragEnabled ? handleDragStart : undefined}
      onDragEnd={!affiliateListMode && nativeDragEnabled ? handleDragEnd : undefined}
      aria-busy={isDeleting}
      style={cardStyle}
    >
      <WorktreeCardUnityTint
        hex={unityTintHex}
        mode={unityTintMode}
        // A title-only card is padded py-2, so its title row sits 3px lower.
        className={unityTintMode === 'chip' && titleOnlyCard ? 'top-[15.5px]' : undefined}
      />
      {showDefaultSwitchDropTarget ? (
        <div
          data-default-worktree-switch-drop-target={worktree.id}
          className={cn(
            'absolute inset-x-1 top-0 z-20 flex h-[34%] min-h-6 items-center justify-center gap-1.5 rounded-t-md border-b text-[10px] font-medium',
            isDefaultSwitchDropTarget
              ? 'border-worktree-sidebar-ring/50 bg-worktree-sidebar-accent text-foreground'
              : 'border-worktree-sidebar-border bg-worktree-sidebar/95 text-muted-foreground'
          )}
          aria-label={translate(
            'auto.components.sidebar.WorktreeCard.defaultSwitchDropAriaLabel',
            'Move the selected worktree to the default project path'
          )}
        >
          <MonitorUp className="size-3" />
          {translate('auto.components.sidebar.WorktreeCard.defaultSwitchDropLabel', 'Make default')}
        </div>
      ) : null}
      {isDeleting && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-[11px] font-medium text-foreground shadow-sm border border-border/50">
            {!isQueuedForDeletion ? (
              <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
            ) : null}
            {deleteLabel}
          </div>
        </div>
      )}
      {isSleeping && newCardStyle && !isDeleting ? (
        // Why a token mix (see [data-worktree-sleeping-dim] in main.css), not opacity:
        // opacity dims toward whatever is painted behind, so the step shrank on lighter
        // surfaces and vanished on custom backgrounds (#19624). Scoped to the parent row
        // so awake lineage children keep their own brightness.
        <div data-worktree-sleeping-dim="">{parentCardContent}</div>
      ) : (
        parentCardContent
      )}

      {newCardStyle && lineageChildren ? (
        <div
          className="mt-1.5 space-y-1"
          data-worktree-lineage-children=""
          style={lineageChildrenStyle}
        >
          {lineageChildren}
        </div>
      ) : null}
    </div>
  )

  return (
    <>
      {affiliateListMode ? (
        cardBody
      ) : (
        <WorktreeContextMenu
          worktree={worktree}
          selectedWorktrees={selectedWorktrees}
          onContextMenuSelect={handleContextMenuSelect}
          onAssignWorkspaceStatus={onAssignWorkspaceStatus}
          onDefaultSwitchRequest={onDefaultSwitchRequest}
        >
          {cardBody}
        </WorktreeContextMenu>
      )}

      {typeof worktree.firstAgentMessageRenameError === 'string' &&
        worktree.firstAgentMessageRenameError.length > 0 && (
          <AutoRenameFailedDialog
            open={showRenameErrorDialog}
            onOpenChange={setShowRenameErrorDialog}
            worktreeId={worktree.id}
            worktreeName={worktree.displayName}
            error={worktree.firstAgentMessageRenameError}
          />
        )}
    </>
  )
}
