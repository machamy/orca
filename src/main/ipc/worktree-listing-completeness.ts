import { existsSync } from 'node:fs'

/**
 * Decides whether a git worktree listing may be trusted to delete state.
 *
 * `git worktree list` reads `.git/worktrees/`. A process that may open the repo
 * but not that directory — macOS gates `~/Documents`, `~/Desktop` and
 * `~/Downloads` per process, and a decision is cached for the process's whole
 * lifetime — gets the main worktree back and NO error. The listing then looks
 * like the user removed every linked worktree.
 *
 * Observed live: a repo under `~/Documents` lost eleven worktrees and their
 * twenty-four tabs twice in one afternoon, each time seconds after a refresh,
 * while every directory and branch was still on disk.
 *
 * A real removal takes the directory with it, so a stored worktree whose folder
 * still exists is proof the listing is incomplete rather than newly empty.
 */
export function listingLooksTruncated(args: {
  /** Paths of worktrees this repo is known to own, from persisted metadata. */
  storedWorktreePaths: readonly string[]
  /** Paths the git listing just reported. */
  listedPaths: readonly string[]
  pathExists?: (path: string) => boolean
}): boolean {
  const exists = args.pathExists ?? existsSync
  const listed = new Set(args.listedPaths)
  return args.storedWorktreePaths.some((path) => !listed.has(path) && exists(path))
}
