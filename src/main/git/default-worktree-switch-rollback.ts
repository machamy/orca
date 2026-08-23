import type { GitRuntimeOptions } from './git-runtime-options'
import {
  checkedOutBranch,
  deleteParkBranchIfUnmoved,
  switchBranch
} from './default-worktree-switch-branch-checkout'
import {
  applyStash,
  dropRescueRef,
  type CapturedWork
} from './default-worktree-switch-work-capture'

/**
 * Undoes a partially applied branch swap, preferring preserved work over a
 * tidy report: every step that cannot be proven safe leaves the captured work
 * in its rescue ref and says so by name.
 */
export async function rollbackBranchSwap(state: {
  defaultPath: string
  selectedPath: string
  demotedBranch: string
  promotedBranch: string
  parkBranch: string
  parkBranchSha: string | null
  defaultStash: CapturedWork | null
  selectedStash: CapturedWork | null
  selectedParked: boolean
  defaultSwitched: boolean
  selectedSwitched: boolean
  options: GitRuntimeOptions
}): Promise<void> {
  const failures: string[] = []
  const revert = async (label: string, run: () => Promise<void>): Promise<void> => {
    try {
      await run()
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  // Restore the branch checkouts in reverse. Free the demoted branch first (park
  // the selected worktree) so the repo path can switch back to it.
  if (state.selectedSwitched) {
    await revert('selected->park', async () => {
      // A warning here means the branch landed but a hook complained — for a
      // rollback the landing is what matters.
      await switchBranch(state.selectedPath, state.parkBranch, state.options)
    })
  }
  if (state.defaultSwitched) {
    await revert('default->demoted', async () => {
      // A warning here means the branch landed but a hook complained — for a
      // rollback the landing is what matters.
      await switchBranch(state.defaultPath, state.demotedBranch, state.options)
    })
  }
  if (state.selectedParked) {
    // The promoted branch is free again (repo path left it) — restore it, then
    // drop the throwaway park branch.
    await revert('selected->original', async () => {
      // A warning here means the branch landed but a hook complained — for a
      // rollback the landing is what matters.
      await switchBranch(state.selectedPath, state.promotedBranch, state.options)
    })
    await revert('drop park branch', () =>
      deleteParkBranchIfUnmoved(
        state.defaultPath,
        state.parkBranch,
        state.parkBranchSha,
        state.options
      )
    )
  }
  // Reapply each side's own stash to its original worktree, and retire its
  // rescue ref once the work is back in the worktree. Keeping the ref after a
  // clean rollback pinned the captured tree against gc forever and grew a
  // refs/orca/default-switch/* entry per retry, invisible to `git stash list`.
  let restored = 0
  if (state.defaultStash) {
    await revert('restore default stash', async () => {
      // Why check the branch first: when the branch restore above failed, this
      // worktree still holds the OTHER side's branch, and applying the stash
      // put this side's work on top of it — duplicated onto the wrong branch,
      // while the report still read as a plain rollback. The rescue ref is the
      // safe copy; leave the work there and say so.
      const on = await checkedOutBranch(state.defaultPath, state.options)
      if (on !== state.demotedBranch) {
        throw new Error(
          `skipped: ${state.defaultPath} is on ${on ?? 'no branch'}, not ${state.demotedBranch}; ` +
            `the work is preserved at ${(state.defaultStash as CapturedWork).rescueRef}`
        )
      }
      await applyStash(state.defaultPath, (state.defaultStash as CapturedWork).sha, state.options)
      restored += 1
    })
  }
  if (state.selectedStash) {
    await revert('restore selected stash', async () => {
      const on = await checkedOutBranch(state.selectedPath, state.options)
      if (on !== state.promotedBranch) {
        throw new Error(
          `skipped: ${state.selectedPath} is on ${on ?? 'no branch'}, not ${state.promotedBranch}; ` +
            `the work is preserved at ${(state.selectedStash as CapturedWork).rescueRef}`
        )
      }
      await applyStash(state.selectedPath, (state.selectedStash as CapturedWork).sha, state.options)
      restored += 1
    })
  }
  const captured = [state.defaultStash, state.selectedStash].filter(
    (entry): entry is CapturedWork => entry !== null
  )
  if (failures.length === 0 && restored === captured.length) {
    const dropped = await Promise.all([
      dropRescueRef(state.defaultPath, state.defaultStash?.rescueRef ?? '', state.options),
      dropRescueRef(state.selectedPath, state.selectedStash?.rescueRef ?? '', state.options)
    ])
    // A ref we failed to delete is a pinned, invisible copy of the user's work.
    // Swallowing that reported a clean rollback and left it there forever.
    if (dropped.includes(false)) {
      failures.push('drop rescue refs')
    }
  }
  if (failures.length > 0) {
    // Why name the rescue refs: the dialog promises "the error lists what to
    // restore", and until now it listed only step labels. These refs are the
    // user's captured work; without them it is a dangling commit reachable only
    // through `git fsck --unreachable`.
    const rescue = captured.map((entry) => entry.rescueRef)
    const rescueHint =
      rescue.length > 0
        ? ` Captured work is kept at: ${rescue.join(', ')} (git stash apply <ref>).`
        : ''
    throw new Error(
      `default_worktree_switch_recovery_required: ${failures.join('; ')}.${rescueHint}`
    )
  }
}
