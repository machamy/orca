// Fork: capabilities the machamy fork publishes, kept in one module like upstream's areas.

/** Host honours `includeUntracked: false` on worktree.defaultSet. Why a
 *  capability rather than a plain optional field: a host that ignores the field
 *  does not fall back to something harmless — it stashes untracked files and
 *  moves them to the other worktree, which is exactly what the user asked it NOT to do. */
export const DEFAULT_SWITCH_KEEP_UNTRACKED_RUNTIME_CAPABILITY =
  'worktree.default-set-keep-untracked.v1' as const

// Hosts without this strip `Repo.worktreeFolders` from repo.update and
// `worktreeFolderId` from worktree.set (zod strip mode), then repo.update's
// echo erases the folder in the same tick as the "successful" write.
export const WORKTREE_FOLDERS_RUNTIME_CAPABILITY = 'worktree.folders.v1' as const

export const FORK_RUNTIME_CAPABILITIES = [
  DEFAULT_SWITCH_KEEP_UNTRACKED_RUNTIME_CAPABILITY,
  WORKTREE_FOLDERS_RUNTIME_CAPABILITY
] as const
