import { randomUUID } from 'node:crypto'
import { rollbackBranchSwap } from './default-worktree-switch-rollback'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import type { GitWorktreeInfo } from '../../shared/worktree/types'
import { parseWslUncPath } from '../../shared/wsl-paths'
import {
  checkedOutBranch,
  revParseOrNull,
  deleteParkBranchIfUnmoved,
  ensureNoOperationInProgress,
  switchBranch,
  switchToNewBranch
} from './default-worktree-switch-branch-checkout'
import {
  describeIgnoredCollisions,
  findIgnoredCollisions
} from './default-worktree-switch-ignored-collision'
import type { CapturedWork } from './default-worktree-switch-work-capture'
import {
  applyStash,
  captureUncommittedAsStash,
  dropRescueRef
} from './default-worktree-switch-work-capture'
import type { GitRuntimeOptions } from './git-runtime-options'
import { listWorktreesStrict } from './worktree'

export type DefaultWorktreeSwitchResult = {
  defaultPath: string
  selectedPath: string
  /** Branch now checked out at the repo path (was the selected worktree's). */
  promotedBranch: string
  /** Branch now checked out at the selected worktree (was the repo path's). */
  demotedBranch: string
  /** Git errors swallowed because HEAD still landed on the right branch (a hook
   *  exiting non-zero after the move, an LFS smudge failure). The tree may be
   *  incomplete; when present, the rescue refs below were kept on purpose. */
  checkoutWarnings?: string[]
  /** Refs pinning each side's captured uncommitted work, retained because a
   *  checkout warned. `git stash apply <ref>` restores one. */
  retainedRescueRefs?: string[]
}

const operationByDefaultPath = new Map<string, Promise<void>>()

/** Generous enough for a large stash or checkout on a slow disk, short enough
 *  that a wedged hook does not take the feature down for the session. */
const DEFAULT_SWITCH_GIT_TIMEOUT_MS = 5 * 60_000

function samePath(left: string, right: string): boolean {
  return normalizeRuntimePathForComparison(left) === normalizeRuntimePathForComparison(right)
}

async function withDefaultSwitchOperation<T>(
  defaultPath: string,
  run: () => Promise<T>
): Promise<T> {
  const key = normalizeRuntimePathForComparison(defaultPath)
  const previous = operationByDefaultPath.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => current)
  operationByDefaultPath.set(key, queued)
  await previous
  try {
    return await run()
  } finally {
    release()
    if (operationByDefaultPath.get(key) === queued) {
      operationByDefaultPath.delete(key)
    }
  }
}

function findEntry(worktrees: GitWorktreeInfo[], path: string): GitWorktreeInfo | undefined {
  return worktrees.find((worktree) => samePath(worktree.path, path))
}

/**
 * Promote `selectedPath`'s branch to the repo's default checkout by swapping the
 * two worktrees' branches IN PLACE — no directory moves, so git's main worktree
 * (and the repo path) never change. Each worktree ends on the other's branch,
 * carrying the other's uncommitted changes (ignored files stay put; untracked
 * files travel unless `includeUntracked` is false).
 *
 * Why not `git worktree move`: git refuses to move the main worktree and the
 * object database lives inside it, so relocating the "default checkout" would
 * mean moving the whole repo. Swapping branches keeps the main worktree stable.
 */
export async function switchDefaultWorktree(args: {
  defaultPath: string
  selectedPath: string
  options?: GitRuntimeOptions
  /** Carry untracked files with their branch (default). False leaves them in
   *  the folder they are in — the branch swaps around them. */
  includeUntracked?: boolean
}): Promise<DefaultWorktreeSwitchResult> {
  return withDefaultSwitchOperation(args.defaultPath, async () => {
    // Why a deadline: the switch runs with both worktrees ALREADY asleep, so a
    // post-checkout hook that never exits leaves every agent down, the per-path
    // lock held, and every later switch queued behind it forever. The local IPC
    // path ignores the caller's timeout, so this is the only bound there is.
    const options: GitRuntimeOptions = {
      ...args.options,
      timeoutMs: args.options?.timeoutMs ?? DEFAULT_SWITCH_GIT_TIMEOUT_MS
    }
    if (options.wslDistro || parseWslUncPath(args.defaultPath)) {
      throw new Error('default_worktree_switch_wsl_unsupported')
    }
    if (samePath(args.defaultPath, args.selectedPath)) {
      throw new Error('default_worktree_switch_already_default')
    }

    // Why spell the deadline out again: this helper takes `timeout`, not
    // `timeoutMs`, so handing it our options silently dropped the bound and its
    // rev-parse probes could hang with both worktrees already asleep.
    const worktrees = await listWorktreesStrict(args.defaultPath, {
      ...options,
      ...(options.timeoutMs ? { timeout: options.timeoutMs } : {})
    })
    const defaultEntry = findEntry(worktrees, args.defaultPath)
    const selectedEntry = findEntry(worktrees, args.selectedPath)
    if (!defaultEntry || defaultEntry.isBare) {
      throw new Error('default_worktree_switch_default_not_found')
    }
    if (!selectedEntry || selectedEntry.isBare || selectedEntry.prunable) {
      throw new Error('default_worktree_switch_selected_not_found')
    }

    const demotedBranch = await checkedOutBranch(args.defaultPath, options)
    const promotedBranch = await checkedOutBranch(args.selectedPath, options)
    // A detached HEAD has no branch to swap; refuse rather than guess a ref.
    if (!demotedBranch || !promotedBranch) {
      throw new Error('default_worktree_switch_detached_head')
    }
    await ensureNoOperationInProgress(args.defaultPath, options)
    await ensureNoOperationInProgress(args.selectedPath, options)

    // The one thing the swap cannot undo. Git overwrites ignored files on
    // checkout without a word (untracked ones it refuses), and nothing captures
    // them — so an ignored path the arriving branch tracks used to be destroyed
    // silently, with no stash and no rescue ref. Refuse instead: stashing the
    // gigabytes of build output this feature promises to leave alone is not an
    // option, and the user can move the paths and switch again.
    const ignoredCollisions = await findIgnoredCollisions({
      defaultPath: args.defaultPath,
      selectedPath: args.selectedPath,
      promotedBranch,
      demotedBranch,
      options
    })
    if (ignoredCollisions.length > 0) {
      throw new Error(
        `default_worktree_switch_ignored_would_be_overwritten: the branch arriving at each ` +
          `worktree tracks these ignored paths, and checking it out would destroy them ` +
          `unrecoverably. Move or delete them, then switch again. ` +
          `${describeIgnoredCollisions(ignoredCollisions)}`
      )
    }

    const includeUntracked = args.includeUntracked !== false
    const defaultStash = await captureUncommittedAsStash(
      args.defaultPath,
      options,
      includeUntracked
    )
    let selectedStash: CapturedWork | null
    try {
      selectedStash = await captureUncommittedAsStash(args.selectedPath, options, includeUntracked)
    } catch (error) {
      // Why: the default worktree's changes are already stashed away; if the
      // selected capture fails (e.g. a merge/rebase in progress there), put the
      // default's changes back before rethrowing, or they'd be stranded in a
      // dropped (dangling) stash the user can't see.
      if (defaultStash) {
        const restored = await applyStash(args.defaultPath, defaultStash.sha, options).then(
          () => true,
          () => false
        )
        if (restored) {
          if (!(await dropRescueRef(args.defaultPath, defaultStash.rescueRef, options))) {
            console.warn(
              `[default-worktree-switch] could not remove rescue ref: ${defaultStash.rescueRef}`
            )
          }
        } else {
          // Otherwise the worktree looks clean while the work exists only under a
          // ref nothing has told the user about.
          throw new Error(
            `default_worktree_switch_recovery_required: ${
              error instanceof Error ? error.message : String(error)
            }. Captured work is kept at: ${defaultStash.rescueRef} (git stash apply <ref>).`
          )
        }
      }
      throw error
    }

    // Free the promoted branch by parking the selected worktree on a throwaway
    // branch (keeps HEAD symbolic — no detached-HEAD reindex in JetBrains IDEs).
    const parkBranch = `orca/default-switch-${randomUUID().slice(0, 8)}`
    // Track completed steps so a mid-swap failure restores the prior state. Flags
    // flip BEFORE each switch: a switch can change state yet still report failure
    // (e.g. a post-checkout hook exits non-zero after moving HEAD), so rollback
    // must assume the step may have partially applied.
    // Read BEFORE parking: a post-checkout hook can commit onto the park branch
    // the moment it is created, so reading afterwards records the hook's commit
    // as the baseline and the guard sees no move.
    let parkBranchSha: string | null = null
    let selectedParked = false
    let defaultSwitched = false
    let selectedSwitched = false
    // A switch can land on the right branch while git still reported an error
    // (hook exit, LFS smudge). The tree may then be incomplete, so the rescue
    // refs are kept and the warnings surfaced instead of silently succeeding.
    const checkoutWarnings: string[] = []
    try {
      parkBranchSha = await revParseOrNull(args.selectedPath, 'HEAD', options)
      selectedParked = true
      const parkWarning = await switchToNewBranch(args.selectedPath, parkBranch, options)
      if (parkWarning) {
        checkoutWarnings.push(parkWarning)
      }
      defaultSwitched = true
      const defaultWarning = await switchBranch(args.defaultPath, promotedBranch, options)
      if (defaultWarning) {
        checkoutWarnings.push(defaultWarning)
      }
      // The demoted branch is now free; check it out at the selected worktree.
      selectedSwitched = true
      const selectedWarning = await switchBranch(args.selectedPath, demotedBranch, options)
      if (selectedWarning) {
        checkoutWarnings.push(selectedWarning)
      }
      // Restore each side's uncommitted work onto the worktree now holding its
      // branch: the repo path (on the promoted branch) gets the selected worktree's
      // changes, and vice versa.
      if (selectedStash) {
        await applyStash(args.defaultPath, selectedStash.sha, options)
      }
      if (defaultStash) {
        await applyStash(args.selectedPath, defaultStash.sha, options)
      }
      // Why only now: rollback frees the demoted branch by parking the selected
      // worktree on this branch. Deleting it before the applies above meant an
      // apply failure left rollback with no park branch — the two worktrees then
      // hold each other's branches and neither can be freed. Reproduced against
      // real git: both sides stayed swapped and the captured work was lost.
      await deleteParkBranchIfUnmoved(args.defaultPath, parkBranch, parkBranchSha, options).catch(
        () => {}
      )
      // A ref we failed to delete is a pinned, invisible copy of the user's
      // work. Reporting it beats leaving it to be found by `git fsck`.
      const stranded: string[] = []
      if (checkoutWarnings.length > 0) {
        // A warned checkout may have left the tree incomplete; the refs are the
        // only complete copy of the captured work, so they stay on purpose.
        for (const captured of [selectedStash, defaultStash]) {
          if (captured) {
            stranded.push(captured.rescueRef)
          }
        }
        console.warn(
          `[default-worktree-switch] checkout warned; retaining rescue refs: ` +
            `${checkoutWarnings.join(' | ')}`
        )
      } else {
        if (
          selectedStash &&
          !(await dropRescueRef(args.selectedPath, selectedStash.rescueRef, options))
        ) {
          stranded.push(selectedStash.rescueRef)
        }
        if (
          defaultStash &&
          !(await dropRescueRef(args.defaultPath, defaultStash.rescueRef, options))
        ) {
          stranded.push(defaultStash.rescueRef)
        }
      }
      if (stranded.length > 0) {
        console.warn(`[default-worktree-switch] rescue refs left in place: ${stranded.join(', ')}`)
      }
    } catch (error) {
      await rollbackBranchSwap({
        defaultPath: args.defaultPath,
        selectedPath: args.selectedPath,
        demotedBranch,
        promotedBranch,
        parkBranch,
        parkBranchSha,
        defaultStash,
        selectedStash,
        selectedParked,
        defaultSwitched,
        selectedSwitched,
        options
      })
      throw error
    }

    return {
      defaultPath: args.defaultPath,
      selectedPath: args.selectedPath,
      promotedBranch,
      demotedBranch,
      ...(checkoutWarnings.length > 0
        ? {
            checkoutWarnings,
            retainedRescueRefs: [selectedStash, defaultStash]
              .filter((captured): captured is CapturedWork => captured !== null)
              .map((captured) => captured.rescueRef)
          }
        : {})
    }
  })
}
