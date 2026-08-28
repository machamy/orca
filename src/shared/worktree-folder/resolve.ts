import type { WorktreeFolder } from './types'

/**
 * The only worktree fields folder resolution reads. `parentWorktreeId` is the
 * *resolved* lineage parent (`projectResolvedWorktreeLineage`), not the raw
 * persisted edge.
 */
export type WorktreeFolderMember = {
  id: string
  parentWorktreeId?: string | null
  worktreeFolderId?: string
}

export const TOP_LEVEL_WORKTREE_FOLDER_PARENT_ID = null

export type ResolvedWorktreeFolderTree = {
  /** Children of each folder, plus `null` for the project's top level. Sorted. */
  foldersByParentId: ReadonlyMap<string | null, readonly WorktreeFolder[]>
  /** Members per folder, in input order. Folders with no members are absent. */
  worktreeIdsByFolderId: ReadonlyMap<string, readonly string[]>
  /** Input order. Everything not filed under a surviving folder. */
  unfiledWorktreeIds: readonly string[]
  /** Resolved membership per worktree; absent means unfiled. */
  folderIdByWorktreeId: ReadonlyMap<string, string>
  /** Folders whose `parentFolderId` was dropped, for diagnostics and tests. */
  brokenParentFolderIds: ReadonlySet<string>
}

/** Higher manualOrder renders earlier; oldest first among ties. */
export function compareWorktreeFolderSiblings(left: WorktreeFolder, right: WorktreeFolder): number {
  const leftOrder = left.manualOrder ?? 0
  const rightOrder = right.manualOrder ?? 0
  if (leftOrder !== rightOrder) {
    return rightOrder - leftOrder
  }
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/**
 * Folders whose parent chain loops. Same walk as
 * `getCyclicWorktreeLineageChildIds`: every id is visited once, and a repeat
 * inside the current path marks the whole loop rather than recursing forever.
 */
function getCyclicWorktreeFolderIds(parentIdByFolderId: ReadonlyMap<string, string>): Set<string> {
  const processed = new Set<string>()
  const cyclic = new Set<string>()

  for (const folderId of parentIdByFolderId.keys()) {
    if (processed.has(folderId)) {
      continue
    }
    const path: string[] = []
    const pathIndexById = new Map<string, number>()
    let currentId: string | undefined = folderId
    while (currentId && parentIdByFolderId.has(currentId) && !processed.has(currentId)) {
      const cycleStart = pathIndexById.get(currentId)
      if (cycleStart !== undefined) {
        for (let index = cycleStart; index < path.length; index += 1) {
          cyclic.add(path[index])
        }
        break
      }
      pathIndexById.set(currentId, path.length)
      path.push(currentId)
      currentId = parentIdByFolderId.get(currentId)
    }
    for (const id of path) {
      processed.add(id)
    }
  }

  return cyclic
}

/**
 * Resolve folder records plus worktree membership into a renderable tree,
 * dropping every invalid edge rather than trusting the store. Corrupt state
 * degrades to "flat", never to a crash or an invisible worktree.
 *
 * Dropped: duplicate folder ids, a `parentFolderId` naming a missing folder or
 * itself (folder goes to top level), folder cycles (the looping edges go to top
 * level), and membership naming a missing folder (worktree renders unfiled).
 *
 * Lineage wins inside a folder: a worktree with a lineage parent in `worktrees`
 * inherits that parent's resolved folder and its own `worktreeFolderId` is
 * ignored, so the structure stays a tree instead of becoming a DAG.
 */
export function resolveWorktreeFolderTree(
  folders: readonly WorktreeFolder[] | undefined,
  worktrees: readonly WorktreeFolderMember[]
): ResolvedWorktreeFolderTree {
  const folderById = new Map<string, WorktreeFolder>()
  for (const folder of folders ?? []) {
    if (folder?.id && !folderById.has(folder.id)) {
      folderById.set(folder.id, folder)
    }
  }

  const parentIdByFolderId = new Map<string, string>()
  const brokenParentFolderIds = new Set<string>()
  for (const folder of folderById.values()) {
    const parentId = folder.parentFolderId
    if (parentId === undefined || parentId === null) {
      continue
    }
    if (parentId === folder.id || !folderById.has(parentId)) {
      brokenParentFolderIds.add(folder.id)
      continue
    }
    parentIdByFolderId.set(folder.id, parentId)
  }
  for (const folderId of getCyclicWorktreeFolderIds(parentIdByFolderId)) {
    parentIdByFolderId.delete(folderId)
    brokenParentFolderIds.add(folderId)
  }

  const foldersByParentId = new Map<string | null, WorktreeFolder[]>()
  for (const folder of folderById.values()) {
    const parentId = parentIdByFolderId.get(folder.id) ?? TOP_LEVEL_WORKTREE_FOLDER_PARENT_ID
    const siblings = foldersByParentId.get(parentId)
    if (siblings) {
      siblings.push(folder)
    } else {
      foldersByParentId.set(parentId, [folder])
    }
  }
  for (const siblings of foldersByParentId.values()) {
    siblings.sort(compareWorktreeFolderSiblings)
  }

  const worktreeById = new Map(worktrees.map((worktree) => [worktree.id, worktree]))
  const folderIdByWorktreeId = new Map<string, string>()
  const ownFolderIdOf = (worktree: WorktreeFolderMember): string | undefined =>
    worktree.worktreeFolderId && folderById.has(worktree.worktreeFolderId)
      ? worktree.worktreeFolderId
      : undefined

  for (const worktree of worktrees) {
    // Walk to the lineage root inside this set; that root's folder owns the whole subtree.
    const visited = new Set<string>([worktree.id])
    let root = worktree
    for (;;) {
      const parentId = root.parentWorktreeId
      if (!parentId || visited.has(parentId)) {
        break
      }
      const parent = worktreeById.get(parentId)
      if (!parent) {
        break
      }
      visited.add(parentId)
      root = parent
    }
    const folderId = ownFolderIdOf(root)
    if (folderId) {
      folderIdByWorktreeId.set(worktree.id, folderId)
    }
  }

  const worktreeIdsByFolderId = new Map<string, string[]>()
  const unfiledWorktreeIds: string[] = []
  for (const worktree of worktrees) {
    const folderId = folderIdByWorktreeId.get(worktree.id)
    if (!folderId) {
      unfiledWorktreeIds.push(worktree.id)
      continue
    }
    const members = worktreeIdsByFolderId.get(folderId)
    if (members) {
      members.push(worktree.id)
    } else {
      worktreeIdsByFolderId.set(folderId, [worktree.id])
    }
  }

  return {
    foldersByParentId,
    worktreeIdsByFolderId,
    unfiledWorktreeIds,
    folderIdByWorktreeId,
    brokenParentFolderIds
  }
}
