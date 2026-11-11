import type { Repo } from '../repo-types'
import type { Worktree } from '../worktree/types'
import { isDefaultCheckoutWorkspace } from '../worktree/ownership'
import type { WorkspaceSortBy } from '../workspace-view/workspace-row-sort'

export function orderMainWorktreeFirst<T extends { isMainWorktree?: boolean }>(
  worktrees: T[],
  sortBy: WorkspaceSortBy
): T[] {
  if (sortBy === 'manual') {
    return worktrees
  }
  const mainWorktrees = worktrees.filter((worktree) => worktree.isMainWorktree)
  if (mainWorktrees.length === 0) {
    return worktrees
  }
  // Keep canonical workspaces first for repo-scanned project groups despite dynamic child ranking.
  return [...mainWorktrees, ...worktrees.filter((worktree) => !worktree.isMainWorktree)]
}

export function orderDefaultCheckoutFirst(
  worktrees: Worktree[],
  repoMap: ReadonlyMap<string, Repo>,
  sortBy?: WorkspaceSortBy
): Worktree[] {
  if (sortBy === 'manual') {
    return worktrees
  }
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
