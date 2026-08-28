import { getRuntimePathBasename } from '../../../../shared/cross-platform-path'
import { areRuntimePathsEqual } from '../../../../shared/worktree/ownership'
import type { Worktree } from '../../../../shared/worktree/types'

/**
 * Fork: the worktrees whose Unity editor tints must stay distinct from this
 * repo's — the whole point of the colour is telling two open editors apart.
 *
 * Shared so the context menu and the "Open in Unity" shortcut hand the main
 * process the same sibling set; a mismatch would re-shuffle every colour
 * depending on which surface opened the project.
 */
export function selectUnityTintSiblingWorktrees(
  allWorktrees: readonly Worktree[],
  repoId: string,
  repoPath: string | undefined
): Worktree[] {
  return (
    allWorktrees
      .filter((candidate) => candidate.repoId === repoId)
      // Unity runs locally, so only local rows can collide over an editor tint;
      // SSH and runtime rows would otherwise eat palette slots for nothing.
      .filter((candidate) => (candidate.hostId ?? 'local') === 'local')
      // The repo-path checkout stays Unity's default grey, so "no colour" reads
      // as "this is the default worktree" and it costs no palette slot.
      .filter((candidate) => repoPath == null || !areRuntimePathsEqual(candidate.path, repoPath))
  )
}

export function unityTintSiblingLabelsOf(siblings: readonly Worktree[]): string[] {
  return siblings.map((candidate) => getRuntimePathBasename(candidate.path) || candidate.path)
}
