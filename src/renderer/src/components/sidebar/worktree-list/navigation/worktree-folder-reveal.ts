import type { GlobalSettings } from '../../../../../../shared/global-settings-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import { findRepoForHost } from '../../../../store/slices/repo-host-identity'
import { getCyclicProjectedWorktreeLineageIds } from '../../worktree-lineage-projection'
import type { WorktreeGroupBy } from '../grouping/row-types'
import {
  getWorktreeFolderGroupKey,
  resolveWorktreeFolderTreeForProject,
  shouldRenderWorktreeFoldersForGroupBy
} from '../grouping/worktree-folder-rows'

/**
 * Fork: the folder ancestor chain hiding a reveal target. A collapsed folder
 * removes member rows entirely (no lineage-group involved), so Cmd+J into one
 * strands the selection unless every ancestor folder is expanded first.
 */
export function getWorktreeFolderRevealGroupKeys(args: {
  worktree: Worktree
  hostWorktreeMap: ReadonlyMap<string, Worktree>
  hostLineageById: Record<string, WorktreeLineage>
  repos: readonly Repo[]
  settings:
    | Pick<GlobalSettings, 'activeRuntimeEnvironmentId' | 'experimentalWorktreeFolders'>
    | null
    | undefined
  groupBy: WorktreeGroupBy
  hostId: ExecutionHostId
}): string[] {
  if (args.settings?.experimentalWorktreeFolders !== true) {
    return []
  }
  if (!shouldRenderWorktreeFoldersForGroupBy(args.groupBy)) {
    return []
  }
  const repo =
    findRepoForHost(args.repos, args.worktree.repoId, { hostId: args.hostId }) ??
    findRepoForHost(args.repos, args.worktree.repoId, { settings: args.settings })
  if (!repo?.worktreeFolders?.length) {
    return []
  }
  const projectWorktrees = [...args.hostWorktreeMap.values()].filter(
    (candidate) => candidate.repoId === args.worktree.repoId
  )
  const hostWorktreeMap = new Map(projectWorktrees.map((worktree) => [worktree.id, worktree]))
  const resolved = resolveWorktreeFolderTreeForProject({
    repo,
    worktrees: projectWorktrees,
    lineageById: args.hostLineageById,
    cyclicLineageIds: getCyclicProjectedWorktreeLineageIds(args.hostLineageById, hostWorktreeMap)
  })
  const folderId = resolved.folderIdByWorktreeId.get(args.worktree.id)
  if (!folderId) {
    return []
  }
  // Sanitized parent edges only — raw records may still hold the cycles the resolver dropped.
  const parentByFolderId = new Map<string, string | null>()
  for (const [parentId, children] of resolved.foldersByParentId) {
    for (const folder of children) {
      parentByFolderId.set(folder.id, parentId)
    }
  }
  const keys: string[] = []
  const seen = new Set<string>()
  let currentId: string | null = folderId
  while (currentId && !seen.has(currentId) && parentByFolderId.has(currentId)) {
    seen.add(currentId)
    keys.unshift(getWorktreeFolderGroupKey(currentId))
    currentId = parentByFolderId.get(currentId) ?? null
  }
  return keys
}
