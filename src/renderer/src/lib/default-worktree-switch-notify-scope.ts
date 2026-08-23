/**
 * Which side's agents hear that the swap happened.
 *
 * Telling both is not always wanted: a quick there-and-back switch only really
 * concerns the agents riding the branch being promoted, and a note to the other
 * side is noise its agents will act on.
 *
 * Named after the BRANCH, not the folder, because that is what the user picks
 * in the dialog and what the agents follow.
 */
export type DefaultSwitchNotifyScope = 'both' | 'promoted' | 'demoted'

export const DEFAULT_SWITCH_NOTIFY_SCOPE: DefaultSwitchNotifyScope = 'both'

/**
 * Resolves the scope to the worktree ids the note should reach AFTER the swap.
 *
 * The swap is in place, so the agents changed folders: whatever rode the
 * promoted branch now sits at the repo default path, and the demoted branch's
 * agents sit at the selected worktree. Resolving this here keeps the inversion
 * in one place instead of at every call site.
 */
export function resolveDefaultSwitchNotifyTargets(args: {
  scope: DefaultSwitchNotifyScope
  /** Worktree selected for promotion — its branch ends up at the repo default path. */
  sourceWorktreeId: string
  /** Worktree at the repo default path before the swap. */
  currentDefaultWorktreeId: string
}): string[] {
  switch (args.scope) {
    case 'promoted':
      return [args.currentDefaultWorktreeId]
    case 'demoted':
      return [args.sourceWorktreeId]
    case 'both':
      return [args.sourceWorktreeId, args.currentDefaultWorktreeId]
  }
}
