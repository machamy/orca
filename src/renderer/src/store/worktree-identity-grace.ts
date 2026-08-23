// Shared shield for worktree identity changes (folder rename, default-worktree swap):
// while armed, a missing id in a list diff means "the id moved", never "the worktree
// was deleted", so purge/teardown paths must skip it. Armed from the worktrees:changed
// listener (including main's pre-swap shield event) so it covers refreshes already in
// flight when the on-disk move starts.
export const WORKTREE_IDENTITY_GRACE_MS = 20_000

const graceExpiryByWorktreeId = new Map<string, number>()

export function armWorktreeIdentityGrace(
  worktreeIds: Iterable<string>,
  durationMs: number = WORKTREE_IDENTITY_GRACE_MS,
  now: number = Date.now()
): void {
  const expiry = now + durationMs
  for (const worktreeId of worktreeIds) {
    graceExpiryByWorktreeId.set(worktreeId, expiry)
  }
}

export function isWorktreeIdentityShielded(worktreeId: string, now: number = Date.now()): boolean {
  const expiry = graceExpiryByWorktreeId.get(worktreeId)
  if (expiry === undefined) {
    return false
  }
  if (expiry <= now) {
    graceExpiryByWorktreeId.delete(worktreeId)
    return false
  }
  return true
}

export function sweepExpiredWorktreeIdentityGrace(now: number = Date.now()): void {
  for (const [worktreeId, expiry] of graceExpiryByWorktreeId) {
    if (expiry <= now) {
      graceExpiryByWorktreeId.delete(worktreeId)
    }
  }
}

export function clearWorktreeIdentityGraceForTests(): void {
  graceExpiryByWorktreeId.clear()
}
