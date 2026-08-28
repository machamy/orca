/**
 * Fork: a **worktree folder** is a label you file worktrees under — it has no
 * path, no branch and no workspace. Not to be confused with a **folder
 * workspace** (`repo.kind === 'folder'`, a real directory you work in), a
 * folder-backed project group (`createdFrom === 'folder-scan'`), or `folderPath`.
 */
export type WorktreeFolder = {
  /** Stable uuid. Never path-derived — a folder has no path. */
  id: string
  name: string
  /** Nesting. null/absent = top level of its project. */
  parentFolderId?: string | null
  /** User-authored order among siblings, higher renders earlier (matches manualOrder). */
  manualOrder?: number
  createdAt: number
}

/**
 * Per-project choice for the status/PR grouping modes, where a folder's members
 * scatter across lanes and the container has nowhere of its own to sit.
 * `'hide'` drops folders entirely; `'repeat-header'` renders the folder header
 * once in every lane it has members in.
 */
export type WorktreeFolderStatusGroupingMode = 'hide' | 'repeat-header'

export const DEFAULT_WORKTREE_FOLDER_STATUS_GROUPING: WorktreeFolderStatusGroupingMode = 'hide'

/** Undefined and any unrecognised persisted value read as the default. */
export function resolveWorktreeFolderStatusGrouping(
  value: unknown
): WorktreeFolderStatusGroupingMode {
  return value === 'repeat-header' || value === 'hide'
    ? value
    : DEFAULT_WORKTREE_FOLDER_STATUS_GROUPING
}

const MAX_WORKTREE_FOLDER_NAME_LENGTH = 200

/**
 * Boundary sanitizer for persisted/RPC input. Drops entries that could never
 * resolve (no id, no usable name) and normalizes the optional fields; structural
 * damage that survives — dangling parents, cycles — is the resolver's job.
 * Undefined means "not a folder list at all" so callers drop the write; an empty
 * array is a legitimate "this project has no folders any more".
 */
export function normalizeWorktreeFolders(value: unknown): WorktreeFolder[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const seenIds = new Set<string>()
  const folders: WorktreeFolder[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const candidate = entry as Partial<WorktreeFolder>
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
    if (!id || !name || seenIds.has(id)) {
      continue
    }
    seenIds.add(id)
    const parentFolderId =
      typeof candidate.parentFolderId === 'string' && candidate.parentFolderId.trim()
        ? candidate.parentFolderId.trim()
        : null
    folders.push({
      id,
      name: name.slice(0, MAX_WORKTREE_FOLDER_NAME_LENGTH),
      parentFolderId,
      ...(typeof candidate.manualOrder === 'number' && Number.isFinite(candidate.manualOrder)
        ? { manualOrder: candidate.manualOrder }
        : {}),
      createdAt:
        typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
          ? candidate.createdAt
          : 0
    })
  }
  return folders
}
