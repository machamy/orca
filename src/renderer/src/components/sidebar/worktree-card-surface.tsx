import React from 'react'
import { LoaderCircle, MonitorUp } from 'lucide-react'
import { translate } from '@/i18n/i18n'

import { cn } from '@/lib/utils'
import { AutoRenameFailedDialog } from './AutoRenameFailedDialog'
import WorktreeContextMenu from './WorktreeContextMenu'
import { WorktreeCardDetailsHover } from './WorktreeCardMeta'
import { WorktreeCardPortsDetails } from './WorktreeCardPorts'
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
    hoverIssue,
    hoverLinearIssue,
    hoverJiraIssue,
    hoverReview,
    hoverComment,
    metaAutomationProvenance,
    metaCliProvenance,
    workspacePorts,
    detailsHoverControl,
    handleRenameTitle,
    handleEditIssue,
    handleEditComment,
    handleOpenGitHubIssueInOrca,
    linearIssue,
    handleOpenLinearIssueInOrca,
    handleOpenReviewInOrca,
    handleOpenAutomation,
    handleOpenAutomationRun,
    hasExplicitLinkedReview,
    handleUnlinkReview,
    showRenameErrorDialog,
    setShowRenameErrorDialog
  } = card
  const { titleOnlyCard, hasHoverDetails, hoverBranchName, hoverWorkspaceTitle, cardStyle } =
    presentation

  const parentCardContent = <WorktreeCardParentContent card={card} presentation={presentation} />

  const parentHoverTriggerBody = (
    <div className="group/worktree-card w-full min-w-0" data-worktree-card-hover-trigger="">
      {parentCardContent}
    </div>
  )

  const parentCardBodyWithHoverDetails =
    hasHoverDetails && !titleRenaming ? (
      <WorktreeCardDetailsHover
        issue={hoverIssue}
        linearIssue={hoverLinearIssue}
        jiraIssue={hoverJiraIssue}
        review={hoverReview}
        comment={hoverComment}
        automationProvenance={metaAutomationProvenance}
        cliProvenance={metaCliProvenance}
        automationHostId={worktree.hostId}
        branchName={hoverBranchName}
        workspaceTitle={hoverWorkspaceTitle}
        workspaceTitleRenameDisabled={isDeleting || affiliateListMode}
        detailsAfter={
          workspacePorts.length > 0 ? <WorktreeCardPortsDetails ports={workspacePorts} /> : null
        }
        openDelay={100}
        hoverControl={detailsHoverControl}
        onRenameWorkspaceTitle={affiliateListMode ? undefined : handleRenameTitle}
        onEditIssue={affiliateListMode ? undefined : handleEditIssue}
        onEditComment={affiliateListMode ? undefined : handleEditComment}
        onOpenGitHubIssueInOrca={
          hoverIssue && 'url' in hoverIssue && hoverIssue.url
            ? handleOpenGitHubIssueInOrca
            : undefined
        }
        onOpenLinearIssueInOrca={linearIssue?.url ? handleOpenLinearIssueInOrca : undefined}
        onOpenReviewInOrca={
          hoverReview?.url && hoverReview.provider === 'github' ? handleOpenReviewInOrca : undefined
        }
        onOpenAutomation={affiliateListMode ? undefined : handleOpenAutomation}
        onOpenAutomationRun={affiliateListMode ? undefined : handleOpenAutomationRun}
        // Why: branch lookup can surface a review without persisted metadata; only unlink when explicitly linked.
        onUnlinkReview={
          !affiliateListMode && hasExplicitLinkedReview ? handleUnlinkReview : undefined
        }
      >
        {parentHoverTriggerBody}
      </WorktreeCardDetailsHover>
    ) : (
      parentHoverTriggerBody
    )

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
            ? 'border border-accent-foreground/20 bg-accent/80'
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
        // Why: no SSH dim — the inline host control now states the disconnected state
        // explicitly, and a subtree opacity would composite its destructive tint and spinner
        // down to an illegible alpha (a descendant cannot escape an ancestor's opacity).
        isRuntimeDisconnected && !isDeleting && 'opacity-60'
      )}
      data-worktree-card-surface="true"
      data-worktree-card-active={isActiveSurface ? activeSurfaceVariant : undefined}
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
      {parentCardBodyWithHoverDetails}

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
