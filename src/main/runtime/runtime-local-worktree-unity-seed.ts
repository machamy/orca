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
import { autoSeedUnityCacheAfterWorktreeCreate } from '../unity/unity-project-worktree'

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
