/**
 * Count folder workspaces too; active filters must not replace surviving rows with an empty state.
 * Fork: worktree-folder rows are chrome, not content — they must not suppress the Clear Filters state.
 */
export function shouldFiltersHideAllRows(counts: {
  hasFilters: boolean
  visibleWorktreeCount: number
  visibleFolderWorkspaceCount: number
  placeholderRepoCount: number
  importedWorktreeCardCount: number
}): boolean {
  return (
    counts.hasFilters &&
    counts.visibleWorktreeCount === 0 &&
    counts.visibleFolderWorkspaceCount === 0 &&
    counts.placeholderRepoCount === 0 &&
    counts.importedWorktreeCardCount === 0
  )
}
