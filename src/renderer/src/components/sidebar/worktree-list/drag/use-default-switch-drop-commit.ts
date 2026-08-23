import { useCallback } from 'react'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { canSwitchWorktreeToDefault } from '../../default-worktree-switch-eligibility'
import type { WorktreeSidebarLineageDropTarget } from './row-state'

export type WorktreeDefaultSwitchDropCommit = ReturnType<typeof useWorktreeDefaultSwitchDropCommit>

/** Fork: dropping a worktree on the default row's "Make default" zone opens the
 *  switch dialog — the drag analog of the context-menu entry point. */
export function useWorktreeDefaultSwitchDropCommit(args: {
  repoMap: Map<string, Repo>
  worktreeMap: Map<string, Worktree>
  onDefaultSwitchRequest?: (worktree: Worktree) => void
}) {
  const { repoMap, worktreeMap, onDefaultSwitchRequest } = args

  const resolveEligibleSource = useCallback(
    (draggedIds: readonly string[], targetId: string): Worktree | null => {
      if (!onDefaultSwitchRequest || draggedIds.length !== 1) {
        return null
      }
      const source = worktreeMap.get(draggedIds[0] as string)
      const target = worktreeMap.get(targetId)
      const eligible =
        source &&
        target &&
        canSwitchWorktreeToDefault({
          source,
          target,
          repo: repoMap.get(target.repoId),
          draggedCount: draggedIds.length
        })
      return eligible ? source : null
    },
    [onDefaultSwitchRequest, repoMap, worktreeMap]
  )

  /** Nulls the target when the drop could not commit, so hover ring and drop agree. */
  const filterEligibleDefaultSwitchTarget = useCallback(
    (
      target: WorktreeSidebarLineageDropTarget,
      draggedIds: readonly string[]
    ): WorktreeSidebarLineageDropTarget => {
      if (!target.defaultSwitchTargetId) {
        return target
      }
      return resolveEligibleSource(draggedIds, target.defaultSwitchTargetId)
        ? target
        : { ...target, defaultSwitchTargetId: null }
    },
    [resolveEligibleSource]
  )

  const commitWorktreeDefaultSwitchDrop = useCallback(
    (draggedIds: readonly string[], targetId: string): boolean => {
      const source = resolveEligibleSource(draggedIds, targetId)
      if (!source) {
        return false
      }
      onDefaultSwitchRequest?.(source)
      return true
    },
    [onDefaultSwitchRequest, resolveEligibleSource]
  )

  return { filterEligibleDefaultSwitchTarget, commitWorktreeDefaultSwitchDrop }
}
