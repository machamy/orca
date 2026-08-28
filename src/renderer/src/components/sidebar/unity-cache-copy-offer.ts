import type { UnityWorktreeStatus } from '../../../../shared/unity-worktree'

/**
 * Whether opening should stop and offer to copy the default checkout's Library
 * first: a worktree with no cache faces a full reimport, and the copy takes
 * seconds. The default checkout is excluded — it IS the donor.
 *
 * A null status means nothing was probed, and an unprobed open must not be
 * silently different from a probed one; callers probe before asking.
 */
export function shouldOfferUnityCacheCopy(
  status: UnityWorktreeStatus | null,
  isDefaultWorktreePath: boolean
): boolean {
  return (
    status !== null &&
    !status.worktreeHasLibrary &&
    status.sourceHasLibrary &&
    !isDefaultWorktreePath
  )
}
