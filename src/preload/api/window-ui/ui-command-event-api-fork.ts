/** Fork-only UI command events; optional because web clients have neither (callers use `?.`). */
export type ForkUiCommandEventApi = {
  /** Fork: ask-once offer to auto-seed a new Unity worktree's cache. */
  onUnityAutoSeedOffer?: (
    callback: (data: { repoId: string; worktreePath: string }) => void
  ) => () => void
}
