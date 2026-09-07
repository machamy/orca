import type { Worktree } from '../../../../shared/worktree/types'

/**
 * What WorktreeList actually rendered, published for window-level consumers.
 *
 * Why null vs []: [] is a real rendered order (everything collapsed or
 * filtered); null means WorktreeList is unmounted, so callers fall back to
 * recomputing.
 */
let publishedVisibleIds: string[] | null = null

export type VisibleWorktreeShortcutTarget = {
  id: string
  executionHostId?: Worktree['hostId']
}

let publishedVisibleShortcutTargets: VisibleWorktreeShortcutTarget[] | null = null

export function setVisibleWorktreeIds(ids: string[] | null): void {
  publishedVisibleIds = ids
}

export function getPublishedVisibleWorktreeIds(): string[] | null {
  return publishedVisibleIds
}

export function setVisibleWorktreeShortcutTargets(
  targets: VisibleWorktreeShortcutTarget[] | null
): void {
  publishedVisibleShortcutTargets = targets
}

export function getPublishedVisibleWorktreeShortcutTargets():
  | VisibleWorktreeShortcutTarget[]
  | null {
  return publishedVisibleShortcutTargets
}
