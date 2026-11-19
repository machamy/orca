/** Fork-only UI command events; optional because web clients have neither (callers use `?.`). */
export type ForkUiCommandEventApi = {
  /** Fork: CLI --ui-flow default-worktree switch request → renderer flow. */
  onDefaultWorktreeSwitchRequest?: (
    callback: (data: {
      repoId: string
      worktreeId: string
      followAgents: boolean
      notifyAgents: boolean
      includeUntracked?: boolean
    }) => void
  ) => () => void
  /** Fork: ask-once offer to auto-seed a new Unity worktree's cache. */
  onUnityAutoSeedOffer?: (
    callback: (data: { repoId: string; worktreePath: string }) => void
  ) => () => void
}
