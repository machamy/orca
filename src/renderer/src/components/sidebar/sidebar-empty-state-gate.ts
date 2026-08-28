/**
 * Whether active filters have hidden every sidebar row, so the Clear Filters
 * empty state should win over any remaining headers.
 *
 * Split out of WorktreeList so the row kinds it counts are testable: folder
 * workspaces were missing from this gate, which meant an account whose only
 * workspaces were folder workspaces lost them to the empty state as soon as any
 * filter — including host scope — was active (#15362).
 *
 * Fork: worktree-folder rows are deliberately NOT an input. They are chrome, not
 * content — when filters hide every worktree, leftover folder rows must not
 * suppress the Clear Filters empty state (they cannot even emit then: folder
 * rows only render inside sections that still contain member worktrees).
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
