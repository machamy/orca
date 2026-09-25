/**
 * Fork: seed a fresh local worktree's Unity `Library` from the default checkout.
 *
 * This is the call site that used to live inline in `orca-runtime.ts`. Upstream
 * dissolved that file into modules (machamy.9), and the fork's call went with it
 * — the seeder survived with its own tests, so the gate stayed green while
 * nothing invoked it. Kept as a thin module so the upstream create path carries
 * a single fork line, and so a census test can assert that line is still there.
 */

import { basename } from 'node:path'
import type { Repo } from '../../shared/repo-types'
import {
  autoSeedUnityCacheAfterWorktreeCreate,
  readUnityEditorVersion
} from '../unity/unity-project-worktree'

export function autoSeedUnityAfterLocalWorktreeCreate(args: {
  repo: Repo
  worktreePath: string
  /** Every path the repo's worktrees occupy; the default checkout is filtered here. */
  repoWorktreePaths: readonly string[]
  offer: () => void
}): void {
  const { repo, worktreePath } = args
  // Every safety gate (live editors, atomic staging, session-file purge) lives
  // inside the seeder; a refusal is normal and the context menu remains the
  // manual path.
  void autoSeedUnityCacheAfterWorktreeCreate({
    sourcePath: repo.path,
    worktreePath,
    decision: repo.unityAutoSeedCache,
    tint: repo.unityWorktreeTint !== false,
    ...(repo.unityTintOverrides ? { tintOverridesByLabel: repo.unityTintOverrides } : {}),
    // The repo-path checkout keeps Unity's default grey, so it is not a sibling.
    tintSiblingLabels: args.repoWorktreePaths
      .filter((path) => path !== repo.path)
      .map((path) => basename(path)),
    offer: args.offer,
    onOutcome: (outcome) => {
      if (outcome.seeded || outcome.reason === 'not_a_unity_project') {
        return
      }
      const detail = 'detail' in outcome && outcome.detail ? ` (${outcome.detail})` : ''
      console.warn(`[unity] auto-seed skipped for ${worktreePath}: ${outcome.reason}${detail}`)
    }
  })
}

/** Runs the seed once the repo's worktree paths are known; never blocks or fails the create. */
export function scheduleUnitySeedAfterLocalWorktreeCreate(args: {
  repo: Repo
  worktreePath: string
  listWorktrees: () => Promise<readonly { repoId: string; path: string }[]>
  offer: () => void
}): void {
  // Why check first: listing starts a worktree scan that can race the create path's own
  // metadata write, so non-Unity repos (and declined ones) must never trigger it.
  if (args.repo.unityAutoSeedCache === false) {
    return
  }
  void readUnityEditorVersion(args.worktreePath)
    .then(async (editorVersion) => {
      if (editorVersion === null) {
        return
      }
      const worktrees = await args.listWorktrees()
      autoSeedUnityAfterLocalWorktreeCreate({
        repo: args.repo,
        worktreePath: args.worktreePath,
        repoWorktreePaths: worktrees
          .filter((entry) => entry.repoId === args.repo.id)
          .map((entry) => entry.path),
        offer: args.offer
      })
    })
    .catch((error) => console.warn('[unity] auto-seed after worktree create failed:', error))
}
