/**
 * Holds the switch's in-flight marker until every side has finished settling.
 *
 * Releasing it at the wake let a second switch in while the first still had up
 * to 75s of respawn sweeps to run; the second re-ran the identity migration and
 * left a tab keyed under BOTH worktrees. Two requests two seconds apart is what
 * a user retrying a failed switch produces, so the window is not theoretical.
 */
export function createDefaultSwitchCompletionGate(
  worktreeIds: readonly string[],
  release: () => void,
  options: { fallbackAfterMs?: number } = {}
): { complete: (worktreeId: string) => void } {
  const pending = new Set(worktreeIds)
  let released = false
  const releaseOnce = (): void => {
    if (released) {
      return
    }
    released = true
    release()
  }
  if (pending.size === 0) {
    releaseOnce()
    return { complete: () => {} }
  }
  // Why a fallback and not the completion signal alone: the sweep scheduler only
  // reports completion from its LAST timer, and that timer returns early when the
  // switch no longer owns the teardown window — a superseding switch, or a window
  // that expired. It also never fires when the scheduler bails before arming any
  // timers. Observed live: a switch whose sweeps never ran left the sidebar
  // spinner turning with no way to finish, and readiness refused every later
  // switch behind it.
  const fallbackAfterMs = options.fallbackAfterMs
  if (fallbackAfterMs !== undefined) {
    setTimeout(releaseOnce, fallbackAfterMs)
  }
  return {
    complete: (worktreeId: string) => {
      if (!pending.delete(worktreeId)) {
        return
      }
      if (pending.size === 0) {
        releaseOnce()
      }
    }
  }
}
