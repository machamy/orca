/**
 * How long a default-switch claim may sit before another switch may ignore it.
 *
 * Lives apart from the readiness check so the store slice can bound a stale
 * claim without importing a module that imports the store — that cycle left
 * `useAppStore` uninitialised in any test that mocks the store.
 *
 * Why six minutes and not the old 30s: a healthy switch on a big repo took
 * longer than 30s, read as stale, and the next switch overwrote its claim and
 * its wake snapshot mid-swap.
 */
export const DEFAULT_SWITCH_IN_FLIGHT_STALE_MS = 6 * 60_000

/**
 * Hard ceiling measured from the switch's START, regardless of heartbeat.
 *
 * Judging staleness on the heartbeat alone removed the only escape hatch: a
 * flow wedged inside the swap RPC (the local IPC path ignores the caller's
 * timeout, and the transcript rename has none at all) keeps pulsing forever, so
 * readiness refused every later switch and both worktrees stayed sleep-guarded
 * with no way out but restarting the app. The heartbeat still lets a healthy
 * long swap run; this bounds an unhealthy one.
 */
export const DEFAULT_SWITCH_ABSOLUTE_MAX_MS = 20 * 60_000
