/**
 * How to kill a spawn that no pane ever adopted.
 *
 * Retiring an unadopted spawn is not the user closing a terminal, but the kill
 * used to look identical to one: with no `keepHistory` the daemon tombstones the
 * session id ("the tombstone rejects reattach to a user-killed session",
 * `daemon-pty-adapter.ts`). Mid-switch that is fatal — the switch's own cold
 * restore resumes exactly that id, gets TerminalKilledError, and `connect()`
 * swallows the error and returns undefined, so the pane stays empty through
 * every respawn sweep and only recovers on the next switch, when the id changes.
 *
 * Outside a switch the tombstone is left in place: that is the Kill-All
 * semantics it exists for.
 */
export function retiredFreshSpawnKillOptions(args: {
  inDefaultSwitchTeardownWindow: boolean
}): { keepHistory: true; retainSurface: true } | undefined {
  return args.inDefaultSwitchTeardownWindow ? { keepHistory: true, retainSurface: true } : undefined
}
