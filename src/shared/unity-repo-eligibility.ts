import { isGitRepoKind } from './repo-kind'
import type { Repo } from './repo-types'

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
