import { isGitRepoKind } from './repo-kind'
import type { Repo } from './repo-types'
import type { Worktree } from './worktree/types'

/**
 * Fork: whether Unity could run against this repo's checkouts at all.
 *
 * Unity, its Library cache and the tint script all live on the local
 * filesystem, so a folder workspace, an SSH repo or a runtime-hosted repo can
 * never hold a Unity project Orca is able to touch. Shared by the worktree
 * context menu and the sidebar tint so the two cannot disagree about which
 * repos the Unity feature covers.
 */
export function isLocallyRunnableUnityRepo(
  repo: Pick<Repo, 'kind' | 'connectionId' | 'executionHostId'> | null | undefined
): boolean {
  return (
    repo != null &&
    isGitRepoKind(repo) &&
    !repo.connectionId &&
    (repo.executionHostId == null || repo.executionHostId === 'local')
  )
}

/**
 * The same test one workspace row at a time: an SSH-hosted worktree of an
 * otherwise-local repo has no local Unity either. Shared so the context menu
 * and the "Open in Unity"/"Open in Rider" shortcuts hide and no-op together.
 */
export function isLocallyRunnableUnityWorkspace(
  worktree: Pick<Worktree, 'hostId'> | null | undefined,
  repo: Pick<Repo, 'kind' | 'connectionId' | 'executionHostId'> | null | undefined
): boolean {
  return (
    worktree != null && (worktree.hostId ?? 'local') === 'local' && isLocallyRunnableUnityRepo(repo)
  )
}
