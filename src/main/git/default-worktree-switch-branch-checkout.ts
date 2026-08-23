import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'
import { gitExecFileAsync } from './runner'

function gitOptions(path: string, options: GitRuntimeOptions) {
  return gitOptionsForWorktree(path, options)
}

/** Short branch name checked out at `path`, or null on a detached HEAD. */
export async function checkedOutBranch(
  path: string,
  options: GitRuntimeOptions
): Promise<string | null> {
  try {
    const result = await gitExecFileAsync(
      ['symbolic-ref', '--quiet', '--short', 'HEAD'],
      gitOptions(path, options)
    )
    const branch = result.stdout.trim()
    return branch.length > 0 ? branch : null
  } catch {
    return null
  }
}

/** Reject a worktree that is mid-merge/cherry-pick/revert — switching branches
 *  there is unsafe, and stashing over it can strand the in-progress state. */
export async function ensureNoOperationInProgress(
  path: string,
  options: GitRuntimeOptions
): Promise<void> {
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']) {
    try {
      await gitExecFileAsync(
        ['rev-parse', '--verify', '--quiet', marker],
        gitOptions(path, options)
      )
    } catch {
      continue // rev-parse exits non-zero when the marker is absent — the good case.
    }
    throw new Error('default_worktree_switch_operation_in_progress')
  }
}

/** Create `newBranch` at the worktree's current commit and switch to it. Used to
 *  free a branch for the swap while keeping HEAD symbolic — a detached HEAD makes
 *  JetBrains IDEs (Rider) drop their branch-scoped caches and reindex. */
export async function switchToNewBranch(
  path: string,
  newBranch: string,
  options: GitRuntimeOptions
): Promise<string | null> {
  let failure: unknown = null
  try {
    await gitExecFileAsync(['switch', '-c', newBranch], gitOptions(path, options))
  } catch (error) {
    failure = error
  }
  // Why verify unconditionally: `git switch --help` exits 0 without switching,
  // so an exit code of 0 does not prove HEAD moved. Trust the resulting state.
  if ((await checkedOutBranch(path, options)) !== newBranch) {
    throw failure ?? new Error('default_worktree_switch_branch_not_checked_out')
  }
  // Same contract as switchBranch: HEAD landed but git errored (a hook firing
  // on the park checkout) — the swap treated only the LATER checkouts' warnings
  // as reasons to retain the rescue refs, so this one deleted them anyway.
  return failure
    ? `switch -c ${newBranch}: ${failure instanceof Error ? failure.message : String(failure)}`
    : null
}

export async function deleteBranch(
  path: string,
  branch: string,
  options: GitRuntimeOptions
): Promise<void> {
  await gitExecFileAsync(['branch', '-D', '--', branch], gitOptions(path, options))
}

/**
 * Drop the throwaway park branch, but never discard work that landed on it.
 *
 * Two guards, because neither alone is enough. `git branch -d` refuses a branch
 * holding commits unreachable from HEAD and decides that inside git under the
 * ref lock, so it closes the window a rev-parse-then-`-D` check left open — but
 * it still deletes a branch whose tip MOVED to something HEAD can reach. The
 * baseline SHA (read before parking) is what says "nothing landed here".
 * A branch left behind is recoverable; a deleted one is not.
 */
export async function deleteParkBranchIfUnmoved(
  path: string,
  branch: string,
  createdAt: string | null,
  options: GitRuntimeOptions
): Promise<void> {
  const current = await revParseOrNull(path, `refs/heads/${branch}`, options)
  if (current === null) {
    return
  }
  // No baseline means we never proved where it started — leave it rather than
  // guess. The debris is visible; the commit it might hold is not.
  if (createdAt === null || current !== createdAt) {
    return
  }
  try {
    await gitExecFileAsync(['branch', '-d', '--', branch], gitOptions(path, options))
  } catch {
    // `-d` judges merged-ness against the CWD's HEAD, and rollback runs this
    // from the OTHER worktree — the park tip is rarely merged into that HEAD,
    // so a perfectly clean rollback reported recovery_required over debris.
    // The baseline equality above already proved nothing landed on the branch.
    // `update-ref -d` with the expected old value is an atomic compare-and-
    // delete under git's ref lock: a hook committing onto the branch BETWEEN
    // the check above and this delete makes it fail instead of destroying the
    // commit, which a forced `branch -D` here would have.
    await gitExecFileAsync(
      ['update-ref', '-d', `refs/heads/${branch}`, createdAt],
      gitOptions(path, options)
    )
  }
}

export async function revParseOrNull(
  path: string,
  ref: string,
  options: GitRuntimeOptions
): Promise<string | null> {
  try {
    const result = await gitExecFileAsync(
      ['rev-parse', '--verify', '--quiet', ref],
      gitOptions(path, options)
    )
    const sha = result.stdout.trim()
    return sha.length > 0 ? sha : null
  } catch {
    return null
  }
}

export async function switchBranch(
  path: string,
  ref: string,
  options: GitRuntimeOptions
): Promise<string | null> {
  let failure: unknown = null
  try {
    // Why `--`: a branch may legitimately be named like an option. `git branch`
    // refuses to create such names but `git update-ref refs/heads/--detach`
    // does not, and clone propagates it. Without the separator `git switch`
    // parsed the name AS an option: `--detach` silently detached HEAD at the
    // wrong worktree and the swap reported success, while `--help` exited 0
    // without switching at all. Both reproduced against real git.
    await gitExecFileAsync(['switch', '--', ref], gitOptions(path, options))
  } catch (error) {
    failure = error
  }
  // Why verify unconditionally rather than only on throw: a post-checkout hook
  // (Husky et al.) can exit non-zero AFTER git moved HEAD, and conversely an
  // option-shaped ref can exit 0 without moving it. The resulting state is the
  // only thing worth trusting in either direction.
  if ((await checkedOutBranch(path, options)) !== ref) {
    throw failure ?? new Error('default_worktree_switch_branch_not_checked_out')
  }
  // HEAD landed on the right branch, but git still reported an error — a hook
  // that exited non-zero after the move, or an LFS smudge that left files
  // unhydrated. Treating that as plain success deleted the rescue refs over a
  // tree that may be incomplete; hand the caller the fact instead.
  return failure
    ? `switch ${ref}: ${failure instanceof Error ? failure.message : String(failure)}`
    : null
}
