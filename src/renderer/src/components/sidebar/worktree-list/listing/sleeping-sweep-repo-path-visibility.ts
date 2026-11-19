import type { AppState } from '@/store/types'
import type { Repo } from '../../../../../../shared/repository/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { isSleepingSweepExempt } from '../../../../../../shared/workspace-view/workspace-row-filters'
import { isRepoPathEntryPoint } from '../../../../../../shared/worktree/visibility/ownership'
import { createSleepingSweepHiddenCheck } from './sleeping-sweep-visibility'

/** Fork: "Hide sleeping" exempts the repo-path checkout, which an in-place default switch keeps as the entry point. */
export function createRepoPathSleepingSweepHiddenCheck(
  state: AppState,
  exemptWorktreeIds?: ReadonlySet<string>
): (worktree: Worktree, repo: Repo | undefined) => boolean {
  const isHidden = createSleepingSweepHiddenCheck(state, exemptWorktreeIds)
  return (worktree, repo) =>
    !isSleepingSweepExempt(
      isRepoPathEntryPoint(worktree, repo),
      state.alwaysShowDefaultBranchWorkspace
    ) &&
    // Why clear the flag: git's main flag follows the displaced checkout, so it must not exempt here.
    isHidden({ ...worktree, isMainWorktree: false })
}
