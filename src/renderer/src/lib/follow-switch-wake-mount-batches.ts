// A follow switch has to mount every tab of both worktrees — the sleep killed
// plain shells too and nothing else retriggers them. Dispatching them in one
// pass is what activation deferral exists to prevent: each mount replays
// scrollback through xterm, attaches a WebGL renderer and reads a snapshot over
// sync IPC, so a worktree with many saved tabs froze the renderer for tens of
// seconds. Batching keeps the agents first (they are what the user watched
// move) and lets the pane-respawn sweep pick up anything a batch missed.
const MOUNT_BATCH_SIZE = 6

export const FOLLOW_WAKE_MOUNT_BATCH_INTERVAL_MS = 300

/**
 * Record-bearing tabs first, then the rest, in mount-sized batches. Order is
 * stable so a retry mounts the same tabs in the same order.
 */
export function planFollowWakeMountBatches(args: {
  liveTabIds: readonly string[]
  agentTabIds: ReadonlySet<string>
}): string[][] {
  const agents = args.liveTabIds.filter((tabId) => args.agentTabIds.has(tabId))
  const rest = args.liveTabIds.filter((tabId) => !args.agentTabIds.has(tabId))
  const ordered = [...agents, ...rest]
  const batches: string[][] = []
  for (let index = 0; index < ordered.length; index += MOUNT_BATCH_SIZE) {
    batches.push(ordered.slice(index, index + MOUNT_BATCH_SIZE))
  }
  return batches
}
