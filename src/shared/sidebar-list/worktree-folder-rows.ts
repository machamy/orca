// Fork: worktree folders (§6). Row emission lives here so the shared builder stays
// pure; resolving membership needs host-correct repo records and stays in the window.
import { getWorktreeExecutionHostId, type ExecutionHostId } from '../execution-host'
import type { Repo } from '../repo-types'
import type { ResolvedWorktreeFolderTree } from '../worktree-folder/resolve'
import type { WorktreeFolder } from '../worktree-folder/types'
import type { WorktreeOccurrence, WorktreeOccurrencePlan } from '../worktree-occurrence-plan'
import type { Worktree } from '../worktree/types'
import { appendWorktreeOccurrenceRows, appendWorktreeRows } from './row-builders'
import type { RepoOfWorktree, Row, WorktreeGroupBy } from './row-types'

/** Collapse-state key — id-scoped (F4): one key folds every row of the folder. */
export function getWorktreeFolderGroupKey(folderId: string): string {
  return `worktree-folder:${folderId}`
}

/**
 * Where folder rows render. Exhaustive on purpose — a new `WorktreeGroupBy`
 * variant must fail here, not silently hide folders (the #15362 lesson).
 */
export function shouldRenderWorktreeFoldersForGroupBy(groupBy: WorktreeGroupBy): boolean {
  switch (groupBy) {
    case 'none':
    case 'repo':
      return true
    case 'workspace-status':
    case 'pr-status':
      return false
  }
}

export type SidebarWorktreeFolderProject = {
  hostId: ExecutionHostId
  repo: Repo
  resolved: ResolvedWorktreeFolderTree
}

/** One resolver pass per project per host; lanes only read the answer. */
export type SidebarWorktreeFolderModel = {
  byHostRepo: ReadonlyMap<string, SidebarWorktreeFolderProject>
}

// Escaped NUL, never the raw byte: a raw \x00 makes git/diff read the file as binary.
export function worktreeFolderHostRepoKey(hostId: ExecutionHostId, repoId: string): string {
  return `${hostId}\u0000${repoId}`
}

type AppendOptions = Parameters<typeof appendWorktreeRows>[3]
type Occurrence = WorktreeOccurrence<Worktree>

/**
 * The one place a folder becomes row-shaped. Per project-per-host block in
 * first-appearance order: one `WorktreeFolderRow` per folder (depth-first),
 * each followed by its members, then every unfiled worktree — today's rows,
 * byte for byte, when there are no folders.
 */
export function appendWorktreeRowsWithFolders(
  result: Row[],
  repoOf: RepoOfWorktree,
  plan: WorktreeOccurrencePlan<Worktree>,
  options: AppendOptions & {
    groupBy: WorktreeGroupBy
    defaultHostId: ExecutionHostId
    repoMap: ReadonlyMap<string, Repo>
  },
  model: SidebarWorktreeFolderModel | null
): void {
  const { groupBy, defaultHostId, repoMap, ...baseOptions } = options
  if (!model || !shouldRenderWorktreeFoldersForGroupBy(groupBy)) {
    appendWorktreeRows(result, repoOf, plan, baseOptions)
    return
  }

  const planned = plan.bySection.get(baseOptions.sectionKey) ?? []
  const blockKeys: string[] = []
  const membersByBlockFolder = new Map<string, Occurrence[]>()
  const unfiled: Occurrence[] = []
  // Why whole subtrees: occurrences are pre-order, so a lineage root's folder
  // carries its descendants and folder members can never split a rendered tree.
  let current = unfiled
  for (const occurrence of planned) {
    if (occurrence.depth === 0) {
      const worktree = occurrence.row
      const hostId = getWorktreeExecutionHostId(
        worktree,
        repoMap.get(worktree.repoId),
        defaultHostId
      )
      const blockKey = worktreeFolderHostRepoKey(hostId, worktree.repoId)
      const project = model.byHostRepo.get(blockKey)
      if (project && !blockKeys.includes(blockKey)) {
        blockKeys.push(blockKey)
      }
      const folderId = project?.resolved.folderIdByWorktreeId.get(worktree.id)
      if (folderId) {
        const memberKey = `${blockKey}\u0000${folderId}`
        current = membersByBlockFolder.get(memberKey) ?? []
        membersByBlockFolder.set(memberKey, current)
      } else {
        current = unfiled
      }
    }
    current.push(occurrence)
  }

  if (blockKeys.length === 0) {
    appendWorktreeOccurrenceRows(result, repoOf, planned, baseOptions)
    return
  }

  // Iterative depth-first pre-order: folder depth is unbounded by design, so a
  // deep-but-valid persisted chain must never overflow the call stack.
  const emitFolderBlock = (blockKey: string, project: SidebarWorktreeFolderProject): void => {
    type Level = { folders: readonly WorktreeFolder[]; index: number; folderDepth: number }
    const stack: Level[] = [
      { folders: project.resolved.foldersByParentId.get(null) ?? [], index: 0, folderDepth: 0 }
    ]
    for (;;) {
      const level = stack.at(-1)
      if (!level) {
        break
      }
      if (level.index >= level.folders.length) {
        stack.pop()
        continue
      }
      const folder = level.folders[level.index]
      level.index += 1
      const members = membersByBlockFolder.get(`${blockKey}\u0000${folder.id}`) ?? []
      const collapsed = baseOptions.collapsedGroups.has(getWorktreeFolderGroupKey(folder.id))
      result.push({
        type: 'worktree-folder',
        key: `worktree-folder:${project.hostId}:${baseOptions.sectionKey}:${folder.id}:0`,
        folder,
        repo: project.repo,
        hostId: project.hostId,
        sectionKey: baseOptions.sectionKey,
        groupDepth: baseOptions.groupDepth,
        folderDepth: level.folderDepth,
        memberCount: members.length,
        collapsed
      })
      if (collapsed) {
        continue
      }
      if (members.length > 0) {
        appendWorktreeOccurrenceRows(result, repoOf, members, {
          ...baseOptions,
          worktreeFolderDepth: level.folderDepth + 1
        })
      }
      const children = project.resolved.foldersByParentId.get(folder.id)
      if (children && children.length > 0) {
        stack.push({ folders: children, index: 0, folderDepth: level.folderDepth + 1 })
      }
    }
  }

  for (const blockKey of blockKeys) {
    const project = model.byHostRepo.get(blockKey)
    if (project) {
      emitFolderBlock(blockKey, project)
    }
  }
  appendWorktreeOccurrenceRows(result, repoOf, unfiled, baseOptions)
}
