import type { Worktree } from '../../../../shared/worktree/types'
import type { Repo } from '../../../../shared/repo-types'
import { isDefaultCheckoutWorkspace } from '../../../../shared/worktree/ownership'

/** Keeps provisioned roots visible because they are the recipe-created workspace, not a source-repo row.
 *
 *  Fork: when the caller can supply the repo, the default row is the REPO-PATH
 *  checkout, not git's isMainWorktree — after an in-place default-worktree
 *  switch the main-worktree flag follows the displaced checkout, and every
 *  surface keyed on it read the wrong row as default. */
export function isDefaultBranchWorkspace(worktree: Worktree, repo?: Repo | undefined): boolean {
  const anchored = repo ? isDefaultCheckoutWorkspace(worktree, repo) : worktree.isMainWorktree
  return (
    anchored &&
    worktree.branch.trim() !== '' &&
    worktree.ephemeralVmCheckoutMode !== 'provisioned-root'
  )
}
