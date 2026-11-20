// Fork: capabilities the machamy fork publishes, kept in one module like upstream's areas.

// Hosts without this strip `Repo.worktreeFolders` from repo.update and
// `worktreeFolderId` from worktree.set (zod strip mode), then repo.update's
// echo erases the folder in the same tick as the "successful" write.
export const WORKTREE_FOLDERS_RUNTIME_CAPABILITY = 'worktree.folders.v1' as const

export const FORK_RUNTIME_CAPABILITIES = [WORKTREE_FOLDERS_RUNTIME_CAPABILITY] as const
