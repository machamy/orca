import type { Repo } from '../repo-types'
import type { WorkspaceStatusDefinition, Worktree } from '../worktree/types'
import type { ProjectSectionModel } from '../project-section-grouping'
import { isDefaultCheckoutWorkspace } from '../worktree/ownership'
import { ALL_GROUP_KEY } from './group-keys'
import type { SidebarPRGroupReader, WorktreeGroupBy } from './row-types'
import { getGroupKeyForWorktree } from './worktree-group-keys'

export function getRenderedNaturalAnchorRepoIds({
  groupBy,
  worktrees,
  repoMap,
  prGroupOf,
  collapsedGroups,
  workspaceStatuses,
  projectGrouping
}: {
  groupBy: WorktreeGroupBy
  worktrees: readonly Worktree[]
  repoMap: Map<string, Repo>
  prGroupOf: SidebarPRGroupReader
  collapsedGroups: ReadonlySet<string>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  projectGrouping?: ProjectSectionModel
}): Set<string> {
  const renderedRepoIds = new Set<string>()
  if (groupBy === 'none') {
    if (!collapsedGroups.has(ALL_GROUP_KEY)) {
      for (const worktree of worktrees) {
        renderedRepoIds.add(worktree.repoId)
      }
    }
    return renderedRepoIds
  }
  if (groupBy === 'repo') {
    for (const worktree of worktrees) {
      renderedRepoIds.add(worktree.repoId)
    }
    return renderedRepoIds
  }
  for (const worktree of worktrees) {
    const groupKey = getGroupKeyForWorktree(
      groupBy,
      worktree,
      repoMap,
      prGroupOf,
      workspaceStatuses,
      projectGrouping
    )
    if (groupKey && !collapsedGroups.has(groupKey)) {
      renderedRepoIds.add(worktree.repoId)
    }
  }
  return renderedRepoIds
}

export function orderDefaultCheckoutFirst(
  worktrees: Worktree[],
  repoMap: ReadonlyMap<string, Repo>
): Worktree[] {
  // Fork: anchor the repo-path checkout, not isMainWorktree — after an in-place
  // default-worktree switch git's main flag follows the displaced checkout.
  let defaults = worktrees.filter((worktree) =>
    isDefaultCheckoutWorkspace(worktree, repoMap.get(worktree.repoId))
  )
  if (defaults.length === 0) {
    // No repo-path match (a repo row without a stored path, or fixtures): fall
    // back to git's own flag rather than dropping the anchor entirely.
    defaults = worktrees.filter((worktree) => worktree.isMainWorktree)
  }
  if (defaults.length === 0) {
    return worktrees
  }
  // Why: project groups are scanned by repo; keep the repo's canonical
  // workspace anchored even when dynamic sorts rank a child workspace first.
  const defaultIds = new Set(defaults.map((worktree) => worktree.id))
  return [...defaults, ...worktrees.filter((worktree) => !defaultIds.has(worktree.id))]
}

/**
 * Build the flat row list consumed by the virtualizer.
 * Extracted here to keep WorktreeList.tsx under the line-count lint limit.
 */
