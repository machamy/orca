import { useCallback, useMemo } from 'react'
import type { WorkspaceStatusDefinition } from '../../../../../../shared/worktree/types'
import type { WorktreeDropCommitContext } from './drop-commit-context'
import type { useWorktreeDragRuntime } from './use-runtime'
import type { useWorktreeDragSession } from './use-session'
import type { useWorktreeLineageDropCommit } from './use-lineage-drop-commit'
import type { useWorktreeDefaultSwitchDropCommit } from './use-default-switch-drop-commit'
import type { WorktreeSidebarLineageDropTarget } from './row-state'

/** Bundles the drag session, lineage commits, and viewport callbacks every drop path reads. */
export function useWorktreeDropCommitContext(args: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  session: ReturnType<typeof useWorktreeDragSession>
  lineageDrop: ReturnType<typeof useWorktreeLineageDropCommit>
  defaultSwitchDrop: ReturnType<typeof useWorktreeDefaultSwitchDropCommit>
  runtime: ReturnType<typeof useWorktreeDragRuntime>
  onMoveWorktreesToStatus: WorktreeDropCommitContext['onMoveWorktreesToStatus']
  onMoveWorktreesToStatusAtIndex: WorktreeDropCommitContext['onMoveWorktreesToStatusAtIndex']
  onReorderWorktrees: WorktreeDropCommitContext['onReorderWorktrees']
  onPinWorktrees: WorktreeDropCommitContext['onPinWorktrees']
}): WorktreeDropCommitContext {
  const { scrollRef, workspaceStatuses, session, lineageDrop, defaultSwitchDrop, runtime } = args
  // Fork: one filter pass answers both "can nest here" and "can become default here",
  // so hover ring and drop commit always agree.
  const getEligibleDropTarget = useCallback(
    (
      target: WorktreeSidebarLineageDropTarget,
      draggedIds: readonly string[]
    ): WorktreeSidebarLineageDropTarget =>
      defaultSwitchDrop.filterEligibleDefaultSwitchTarget(
        lineageDrop.getEligibleLineageDropTarget(target, draggedIds),
        draggedIds
      ),
    [defaultSwitchDrop, lineageDrop]
  )
  const {
    onMoveWorktreesToStatus,
    onMoveWorktreesToStatusAtIndex,
    onReorderWorktrees,
    onPinWorktrees
  } = args
  return useMemo<WorktreeDropCommitContext>(
    () => ({
      scrollRef,
      workspaceStatuses,
      worktreeDragGroups: session.worktreeDragGroups,
      worktreeDragUnitGroups: session.worktreeDragUnitGroups,
      computeWorktreeDrop: session.computeWorktreeDrop,
      computeWorktreeStatusDrop: session.computeWorktreeStatusDrop,
      refreshWorktreeDragSession: session.refreshWorktreeDragSession,
      getEligibleLineageDropTarget: getEligibleDropTarget,
      commitWorktreeLineageParentDrop: lineageDrop.commitWorktreeLineageParentDrop,
      commitWorktreeDefaultSwitchDrop: defaultSwitchDrop.commitWorktreeDefaultSwitchDrop,
      clearReorderedWorktreeParents: lineageDrop.clearReorderedWorktreeParents,
      clearWorktreeDrag: runtime.clearWorktreeDrag,
      onMoveWorktreesToStatus,
      onMoveWorktreesToStatusAtIndex,
      onReorderWorktrees,
      onPinWorktrees
    }),
    [
      defaultSwitchDrop.commitWorktreeDefaultSwitchDrop,
      getEligibleDropTarget,
      lineageDrop.clearReorderedWorktreeParents,
      lineageDrop.commitWorktreeLineageParentDrop,
      onMoveWorktreesToStatus,
      onMoveWorktreesToStatusAtIndex,
      onPinWorktrees,
      onReorderWorktrees,
      runtime.clearWorktreeDrag,
      scrollRef,
      session.computeWorktreeDrop,
      session.computeWorktreeStatusDrop,
      session.refreshWorktreeDragSession,
      session.worktreeDragGroups,
      session.worktreeDragUnitGroups,
      workspaceStatuses
    ]
  )
}
