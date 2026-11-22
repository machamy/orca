import type { AppState } from '@/store/types'
import type { Repo } from '../../../../../../shared/repository/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { isSleepingSweepExempt } from '../../../../../../shared/workspace-view/workspace-row-filters'
import { isRepoPathEntryPoint } from '../../../../../../shared/worktree/visibility/ownership'
import { createWorkspaceAsleepCheck } from './sleeping-sweep-visibility'

/** Fork: "Hide sleeping" exempts the repo-path checkout rather than git's main-worktree flag. */
export function isRepoPathSleepingSweepExempt(
  state: AppState,
  worktree: Worktree,
  repo: Repo | undefined
): boolean {
  return isSleepingSweepExempt(
    isRepoPathEntryPoint(worktree, repo),
    state.alwaysShowDefaultBranchWorkspace
  )
}

export function createRepoPathSleepingSweepHiddenCheck(
  state: AppState,
  exemptWorktreeIds?: ReadonlySet<string>
): (worktree: Worktree, repo: Repo | undefined) => boolean {
  const isAsleep = createWorkspaceAsleepCheck(state, exemptWorktreeIds)
  return (worktree, repo) =>
    !isRepoPathSleepingSweepExempt(state, worktree, repo) && isAsleep(worktree)
}
