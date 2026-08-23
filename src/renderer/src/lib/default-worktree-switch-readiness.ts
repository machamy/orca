// Rapid consecutive default switches were observed stranding agents as bare
// shells: a switch fired while a previous switch's agents were still booting
// (codex: MCP startup before the first hook) sleeps panes that have no
// capturable session yet — capture finds nothing, the tab moves recordless,
// and the wake can only spawn an empty shell. The switch flow therefore WAITS:
// first for any in-flight switch to finish, then for every live agent pane in
// the swapped worktrees to report a resumable session; on timeout it aborts
// with the offending tabs named instead of proceeding into agent loss.
import type { AppState } from '@/store/types'
import {
  DEFAULT_SWITCH_ABSOLUTE_MAX_MS,
  DEFAULT_SWITCH_IN_FLIGHT_STALE_MS
} from './default-worktree-switch-stale-bound'
import { useAppStore } from '@/store'
import { isResumableTuiAgent } from '../../../shared/agent-session-resume'

const IN_FLIGHT_WAIT_MS = 30_000
const READINESS_WAIT_MS = 45_000
const POLL_MS = 500

export type UnreadyAgentPane = {
  worktreeId: string
  tabId: string
  title: string
}

/** Agent tabs with a LIVE pty whose panes have no capturable provider session
 *  yet (no live row, or a row without providerSession/lastKnown fallback). */
export function findUnreadyAgentPanes(
  state: AppState,
  worktreeIds: readonly string[]
): UnreadyAgentPane[] {
  const unready: UnreadyAgentPane[] = []
  for (const worktreeId of worktreeIds) {
    for (const tab of state.tabsByWorktree[worktreeId] ?? []) {
      if (!tab.launchAgent || !isResumableTuiAgent(tab.launchAgent)) {
        continue
      }
      const livePtyIds = state.ptyIdsByTabId[tab.id] ?? []
      if (livePtyIds.length === 0) {
        continue // no live process — nothing to lose by sleeping
      }
      // Capture reads BOTH the live status rows and the resume records, so
      // readiness must too. A cold-restored agent emits no hook until its next
      // event (codex: not until the next prompt) and has no status row, but the
      // restore re-recorded the session it resumed with — it is capturable.
      // Checking only the status row refused every switch after an app restart
      // until the user manually prompted each agent.
      const capturable =
        Object.values(state.agentStatusByPaneKey).some(
          (entry) =>
            entry.tabId === tab.id &&
            Boolean(entry.providerSession ?? entry.lastKnownProviderSession)
        ) ||
        Object.values(state.sleepingAgentSessionsByPaneKey ?? {}).some(
          (record) => record.tabId === tab.id && Boolean(record.providerSession)
        )
      if (!capturable) {
        unready.push({
          worktreeId,
          tabId: tab.id,
          title: tab.customTitle ?? tab.title
        })
      }
    }
  }
  return unready
}

/** The marker only excludes a rival once its own flow has been admitted —
 *  otherwise a switch reads the marker it just published and refuses itself. */
function admittedSwitchInFlight(): {
  worktreeIds: string[]
  startedAt: number
  heartbeatAt: number
} | null {
  const inFlight = useAppStore.getState().defaultSwitchInFlight
  return inFlight && inFlight.admitted && inFlight.blocking !== false ? inFlight : null
}

/** Live = pulsing recently AND not past the hard ceiling from its start. */
function switchIsLive(
  marker: { startedAt: number; heartbeatAt: number },
  now: number = Date.now()
): boolean {
  return (
    now - marker.heartbeatAt < DEFAULT_SWITCH_IN_FLIGHT_STALE_MS &&
    now - marker.startedAt < DEFAULT_SWITCH_ABSOLUTE_MAX_MS
  )
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export type SwitchReadinessResult =
  | { ready: true; unready?: UnreadyAgentPane[] }
  | { ready: false; reason: 'switch_in_flight' }

/** How long an in-flight switch is believed before a later one may barge in — a
 *  wedged flow must not block the feature forever. Must outlast the git-side
 *  deadline (5 min): at 30s a perfectly healthy switch on a big repo read as
 *  stale, and the second switch overwrote its claim and its wake snapshot
 *  mid-swap. */
export { DEFAULT_SWITCH_IN_FLIGHT_STALE_MS } from './default-worktree-switch-stale-bound'

/** Wait for the swap window to be safe: no switch in flight, and every live
 *  agent pane on either side capturable. Resolves unready on timeout. */
export async function waitForDefaultSwitchReadiness(
  worktreeIds: readonly string[],
  /** Called with whoever the wait is currently blocked on, so the UI can name
   *  it instead of showing an unattributed spinner for up to 45 seconds. */
  onWaiting?: (pending: UnreadyAgentPane[]) => void
): Promise<SwitchReadinessResult> {
  const inFlightDeadline = Date.now() + IN_FLIGHT_WAIT_MS
  while (Date.now() < inFlightDeadline) {
    const inFlight = admittedSwitchInFlight()
    if (!inFlight || !switchIsLive(inFlight)) {
      break
    }
    await sleep(POLL_MS)
  }
  const blocking = admittedSwitchInFlight()
  if (blocking && switchIsLive(blocking)) {
    return { ready: false, reason: 'switch_in_flight' }
  }

  const readinessDeadline = Date.now() + READINESS_WAIT_MS
  let unready = findUnreadyAgentPanes(useAppStore.getState(), worktreeIds)
  if (unready.length > 0) {
    onWaiting?.(unready)
  }
  while (unready.length > 0 && Date.now() < readinessDeadline) {
    await sleep(POLL_MS)
    unready = findUnreadyAgentPanes(useAppStore.getState(), worktreeIds)
  }
  // Why proceed instead of refusing: a cold-restored agent consumes the record
  // it resumed from and then emits nothing until its next turn, so it can stay
  // "uncapturable" indefinitely — refusing made the switch impossible after an
  // app restart until the user manually prompted every agent. The teardown
  // suppression, dead-binding clearing and post-wake respawn sweep now keep the
  // tab, its panes and its split intact regardless; the residual risk is that
  // such an agent comes back on a fresh session, which the caller warns about.
  return unready.length > 0 ? { ready: true, unready } : { ready: true }
}
