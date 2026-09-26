import { isFolderRepo } from '../../../../shared/repo-kind'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { isDefaultCheckoutWorkspace } from '../../../../shared/worktree/ownership'

/** Keeps provisioned roots visible because they are the recipe-created workspace, not a source-repo row.
 *
 *  Fork: when the caller can supply the repo path, a git repo's default row is the
 *  REPO-PATH checkout, not git's isMainWorktree — after an in-place default-worktree
 *  switch the main-worktree flag follows the displaced checkout. */
export function isDefaultBranchWorkspace(
  worktree: Worktree,
  repo: (Pick<Repo, 'kind'> & Partial<Pick<Repo, 'path'>>) | undefined
): boolean {
  if (worktree.ephemeralVmCheckoutMode === 'provisioned-root') {
    return false
  }
  const isFolder = repo !== undefined && isFolderRepo(repo)
  const anchored =
    !isFolder && repo?.path
      ? isDefaultCheckoutWorkspace(worktree, { path: repo.path, kind: repo.kind })
      : worktree.isMainWorktree
  if (!anchored) {
    return false
  }
  // Why: a folder project's root is its default workspace but has no branch; on a git repo an
  // empty branch means detached HEAD or an offline SSH row, which stay visible.
  return worktree.branch.trim() !== '' || isFolder
}
