// Default-worktree switch ("agents follow" / sleep-in-place): between the sleep
// that captures the agents' resume records and the post-switch wake, panes that
// are still mounted (React unmount lags the teardown) react to their PTY dying
// by running an immediate cold-restore — consuming the fresh records and
// relaunching the agents at the OLD paths. Observed live: 4 records captured,
// all 4 consumed by pane cold-restores within ~100ms of the sleep, leaving the
// switch's wake with nothing to resume. While a worktree is guarded, pane-side
// cold-restore spawns are skipped so the records stay for the switch's wake.
// Why 120s and not 30s: the flow re-arms this every 5s, but Electron throttles a
// backgrounded window's timers (down to once a minute when hidden a while), and
// minimising the app during a long swap is the normal case. At 30s the guard
// died for half of every throttled minute while the 6-minute lock survived —
// the worst possible asymmetry. The wake ends this explicitly, and the flow's
// error paths do too, so a longer TTL only bounds the case where neither ran.
const GUARD_TTL_MS = 120_000

const guardExpiryByWorktreeId = new Map<string, number>()

export function beginDefaultSwitchSleepGuard(
  worktreeIds: Iterable<string>,
  now: number = Date.now()
): void {
  const expiry = now + GUARD_TTL_MS
  for (const worktreeId of worktreeIds) {
    guardExpiryByWorktreeId.set(worktreeId, expiry)
  }
}

/** Why per-worktree: clearing the whole map let one switch's failure path (or
 *  any follow-wake) disarm a DIFFERENT switch's guards, so that switch's
 *  still-landing PTY kills took the unsuppressed branch and closed single-pane
 *  tabs. Omitting the ids keeps the old wipe for callers that own everything. */
export function endDefaultSwitchSleepGuard(worktreeIds?: Iterable<string>): void {
  if (!worktreeIds) {
    guardExpiryByWorktreeId.clear()
    return
  }
  for (const worktreeId of worktreeIds) {
    guardExpiryByWorktreeId.delete(worktreeId)
  }
}

export function isDefaultSwitchSleepGuarded(worktreeId: string, now: number = Date.now()): boolean {
  const expiry = guardExpiryByWorktreeId.get(worktreeId)
  if (expiry === undefined) {
    return false
  }
  if (expiry <= now) {
    guardExpiryByWorktreeId.delete(worktreeId)
    return false
  }
  return true
}

// The teardown window outlives the spawn guard above. The sleep's PTY kills
// land asynchronously — observed arriving AFTER endDefaultSwitchSleepGuard(),
// which runs just before the wake — and a pane whose ptyId changed since the
// shutdown snapshot misses the exit guard. Its exit then closed the pane, and a
// single-pane tab with it (trace: pane_exit_teardown -> tab_close 'pty-exit',
// losing PLAIN-A/PLAIN-B outright). While this window is open the switch owns
// every teardown for the two worktrees; the wake remounts what it needs.
const TEARDOWN_WINDOW_MS = 90_000

const teardownExpiryByWorktreeId = new Map<string, number>()

export function beginDefaultSwitchTeardownWindow(
  worktreeIds: Iterable<string>,
  now: number = Date.now()
): void {
  const expiry = now + TEARDOWN_WINDOW_MS
  for (const worktreeId of worktreeIds) {
    teardownExpiryByWorktreeId.set(worktreeId, expiry)
  }
}

export function endDefaultSwitchTeardownWindow(worktreeIds?: Iterable<string>): void {
  if (!worktreeIds) {
    teardownExpiryByWorktreeId.clear()
    return
  }
  for (const worktreeId of worktreeIds) {
    teardownExpiryByWorktreeId.delete(worktreeId)
  }
}

export function isInDefaultSwitchTeardownWindow(
  worktreeId: string,
  now: number = Date.now()
): boolean {
  const expiry = teardownExpiryByWorktreeId.get(worktreeId)
  if (expiry === undefined) {
    return false
  }
  if (expiry <= now) {
    teardownExpiryByWorktreeId.delete(worktreeId)
    return false
  }
  return true
}
