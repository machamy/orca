import {
  WAKE_HIBERNATED_AGENTS_WORKTREE_EVENT,
  type WakeHibernatedAgentsWorktreeDetail
} from '@/constants/terminal'
import { requestBackgroundTerminalWorktreeMount } from '@/components/terminal/background-terminal-worktree-mount'
import {
  FOLLOW_WAKE_MOUNT_BATCH_INTERVAL_MS,
  planFollowWakeMountBatches
} from '@/lib/follow-switch-wake-mount-batches'
import { useAppStore } from '@/store'
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import { parseLegacyNumericPaneKey, parsePaneKey } from '../../../shared/stable-pane-id'
import { resumeSleepingAgentSessionsForWorktree } from './resume-sleeping-agent-session'
import {
  getProviderSessionClaimKey,
  isPassiveCompletedHibernationEvidence,
  recordPaneIsOwnedByPreservedPane
} from './sleeping-agent-pane-ownership'

type BackgroundSleepingAgentWakeDispatcherOptions = {
  isWorkspaceSessionReady?: () => boolean
  subscribeToStore?: (listener: () => void) => () => void
  wake?: (worktreeId: string) => void
}

/**
 * Buffers main's one-shot mobile wake until persisted sleeping records exist.
 * Why: the renderer can attach its IPC listener before workspace hydration;
 * dropping an early event leaves the phone connected to frozen slept panes.
 */
export function createBackgroundSleepingAgentWakeDispatcher(
  options: BackgroundSleepingAgentWakeDispatcherOptions = {}
): { request: (worktreeId: string) => void; dispose: () => void } {
  const pendingWorktreeIds = new Set<string>()
  const isWorkspaceSessionReady =
    options.isWorkspaceSessionReady ?? (() => useAppStore.getState().workspaceSessionReady)
  const subscribeToStore =
    options.subscribeToStore ?? ((listener) => useAppStore.subscribe(listener))
  const wake = options.wake ?? wakeSleepingAgentsForWorktreeInBackground
  let unsubscribeReadiness: (() => void) | null = null
  let disposed = false

  const flushWhenReady = (): void => {
    if (disposed || !isWorkspaceSessionReady()) {
      return
    }
    const worktreeIds = [...pendingWorktreeIds]
    pendingWorktreeIds.clear()
    unsubscribeReadiness?.()
    unsubscribeReadiness = null
    for (const worktreeId of worktreeIds) {
      wake(worktreeId)
    }
  }

  return {
    request(worktreeId) {
      if (disposed || !worktreeId) {
        return
      }
      if (isWorkspaceSessionReady()) {
        wake(worktreeId)
        return
      }
      pendingWorktreeIds.add(worktreeId)
      unsubscribeReadiness ??= subscribeToStore(flushWhenReady)
    },
    dispose() {
      disposed = true
      pendingWorktreeIds.clear()
      unsubscribeReadiness?.()
      unsubscribeReadiness = null
    }
  }
}

function getSleepingRecordTabId(record: SleepingAgentSessionRecord): string | null {
  return (
    record.tabId ??
    parsePaneKey(record.paneKey)?.tabId ??
    parseLegacyNumericPaneKey(record.paneKey)?.tabId ??
    null
  )
}

function dispatchBackgroundMount(worktreeId: string, tabIds: readonly string[] | undefined): void {
  requestBackgroundTerminalWorktreeMount({ worktreeId, ...(tabIds ? { tabIds } : {}) })
}

/**
 * Bring a switched worktree's terminals back, batched.
 *
 * Why batched: the sleep unmounted every pane, so the wake remounts all of them
 * — each replaying scrollback through xterm, attaching a WebGL renderer and
 * reading a snapshot over sync IPC. In one render pass that is the tens-of-
 * seconds freeze activation deferral exists to prevent, and it needs
 * `narrowExisting` to take effect at all: a worktree the user had visited is
 * already "mounted", so an ordinary targeted request is ignored and everything
 * mounts at once anyway. Later batches widen the set, and the pane-respawn
 * sweep picks up anything a batch missed.
 */
export function mountSwitchedWorktreeTabsInBatches(worktreeId: string): void {
  const state = useAppStore.getState()
  const liveTabIds = (state.tabsByWorktree[worktreeId] ?? []).map((tab) => tab.id)
  const agentTabIds = new Set<string>()
  for (const record of Object.values(state.sleepingAgentSessionsByPaneKey)) {
    if (record.worktreeId !== worktreeId) {
      continue
    }
    const tabId = getSleepingRecordTabId(record)
    if (tabId) {
      agentTabIds.add(tabId)
    }
  }
  const batches = planFollowWakeMountBatches({ liveTabIds, agentTabIds })
  batches.forEach((tabIds, index) => {
    const dispatch = (): void =>
      requestBackgroundTerminalWorktreeMount({ worktreeId, tabIds, narrowExisting: true })
    if (index === 0) {
      dispatch()
      return
    }
    setTimeout(dispatch, index * FOLLOW_WAKE_MOUNT_BATCH_INTERVAL_MS)
  })
}

function getCanonicalPassiveWakeRecords(
  records: readonly SleepingAgentSessionRecord[],
  alreadyClaimed: ReadonlySet<string>
): SleepingAgentSessionRecord[] {
  const activeClaimKeys = new Set(
    records
      .filter((record) => !isPassiveCompletedHibernationEvidence(record))
      .map(getProviderSessionClaimKey)
  )
  const recordsByClaim = new Map<string, SleepingAgentSessionRecord[]>()
  for (const record of records) {
    if (!isPassiveCompletedHibernationEvidence(record)) {
      continue
    }
    const claimKey = getProviderSessionClaimKey(record)
    if (alreadyClaimed.has(claimKey) || activeClaimKeys.has(claimKey)) {
      continue
    }
    const grouped = recordsByClaim.get(claimKey) ?? []
    grouped.push(record)
    recordsByClaim.set(claimKey, grouped)
  }

  const canonicalRecords: SleepingAgentSessionRecord[] = []
  const duplicatePaneKeys: string[] = []
  const state = useAppStore.getState()
  for (const grouped of recordsByClaim.values()) {
    const ordered = grouped
      .slice()
      .sort((a, b) => a.capturedAt - b.capturedAt || a.updatedAt - b.updatedAt)
    const liveTabIds = new Set(
      (state.tabsByWorktree[grouped[0]?.worktreeId ?? ''] ?? []).map((tab) => tab.id)
    )
    const canonical =
      ordered.find((record) => recordPaneIsOwnedByPreservedPane(record, state)) ??
      ordered.find((record) => {
        const tabId = getSleepingRecordTabId(record)
        return tabId !== null && liveTabIds.has(tabId)
      }) ??
      ordered.find((record) => getSleepingRecordTabId(record) !== null) ??
      ordered[0]
    if (!canonical) {
      continue
    }
    canonicalRecords.push(canonical)
    for (const duplicate of grouped) {
      if (duplicate !== canonical) {
        // Why: two cold panes mount after the event-scoped claim collector is
        // gone. Keep one provider-session record so only one can issue resume.
        duplicatePaneKeys.push(duplicate.paneKey)
      }
    }
  }
  state.clearSleepingAgentSessionsByPaneKey(duplicatePaneKeys)
  return canonicalRecords
}

/**
 * Default-worktree switch "agents follow" only. The user explicitly asked the
 * agents to move, so EVERY slept agent — including restoreOnTabOpenOnly
 * (idle/'done') and non-passive (was-working) records the generic wake below
 * deliberately leaves lazy or forks into fresh tabs (#11598) — must cold-restore
 * visibly in its own preserved tab right after the switch. Mounting the tab is
 * sufficient: the pane's mount-connect finds the sleeping record and runs the
 * fresh cold-restore --resume at the worktree's (new) home. Skipping the generic
 * resume launch avoids duplicate fresh-tab forks for the non-activated side.
 */
export function wakeFollowedSleptAgentsForWorktree(worktreeId: string): void {
  // Why no early return on an empty record set: this worktree was still slept,
  // so its plain shells are down and only this path remounts them.
  // In-place wake for panes that stayed mounted (e.g. activity portals).
  const wokenClaimKeys = new Set<string>()
  window.dispatchEvent(
    new CustomEvent<WakeHibernatedAgentsWorktreeDetail>(WAKE_HIBERNATED_AGENTS_WORKTREE_EVENT, {
      detail: { worktreeId, wokenClaimKeys }
    })
  )
  // Why every tab, not just the record-bearing ones. The sleep killed plain
  // shells too, and the switch's guard skipped their respawn to protect the
  // agents' resume records; nothing else retriggers them, so a recordless pane
  // would sit PTY-less until the layout collapsed it — losing split panes and
  // single-pane tabs the user never asked to close.
  mountSwitchedWorktreeTabsInBatches(worktreeId)
  // Deliberately NO generic fresh-tab resume here. Follow mode's premise is
  // that every agent keeps its own tab, so forking a new one is always wrong —
  // and the fork fires exactly when it is least safe: right after the swap the
  // tab list has not settled, so records read as "tab is gone" and each one
  // mints a duplicate. Observed live: one claude and one codex came back as
  // three tabs each. A record whose tab is truly gone stays in the store and is
  // restored when a tab next opens for it, which costs a lazy restore instead
  // of littering the workspace with forks.
}

/**
 * Wakes a worktree's slept agents on the desktop host renderer with NO desktop
 * navigation — used when a phone (`clientKind: 'mobile'`) opens the worktree.
 * Runs up to four steps, in order:
 *  (a) fire the armed cold-restore `--resume` of the worktree's mounted hidden
 *      hibernated panes (the experimental agent-sleep records; the primary
 *      wake mechanism, since those records are passive for path C). Panes that
 *      consume — or latch, when the wake races the hibernation kill — the
 *      in-place wake claim their provider sessions via the event detail;
 *  (b) background-mount the tabs holding passive hibernated records that are
 *      NOT currently mounted (post-restart / evicted) so they take the
 *      fresh-connect cold-restore path. The mount is targeted by tabId so one
 *      sleeping pane does not permanently mount every saved tab, and skips
 *      `restoreOnTabOpenOnly` records so an explicit workspace sleep is not
 *      undone wholesale by a phone opening the workspace;
 *  (c) resume the non-passive record classes (manual sleep of a still-working
 *      agent, `origin: 'quit'`) with navigation suppressed, skipping the
 *      claims from (a);
 *  (d) background-mount the tabs (c) created — they are `activate: false`, so
 *      nothing else would mount them and their queued `--resume` startup
 *      would otherwise never reach a PTY.
 * Woken PTYs auto-publish to mobile via the renderer graph republish, so no
 * spawn is awaited.
 */
export function wakeSleepingAgentsForWorktreeInBackground(worktreeId: string): void {
  const worktreeRecords = Object.values(
    useAppStore.getState().sleepingAgentSessionsByPaneKey
  ).filter((record) => record.worktreeId === worktreeId)
  // Why: nothing is slept here, so there is no wake work. Skipping is what keeps
  // a phone browsing many worktrees from permanently background-mounting each one
  // (and reattaching its PTYs) on the desktop host it is paired to.
  if (worktreeRecords.length === 0) {
    return
  }

  const wokenClaimKeys = new Set<string>()
  window.dispatchEvent(
    new CustomEvent<WakeHibernatedAgentsWorktreeDetail>(WAKE_HIBERNATED_AGENTS_WORKTREE_EVENT, {
      detail: { worktreeId, wokenClaimKeys }
    })
  )
  // Why: only a passive completed-hibernation record has a not-yet-mounted pane
  // that needs a fresh-connect cold-restore (step b). Non-passive records are
  // recovered by step (c) into a fresh tab, mounted in step (d).
  const passiveTabIds = new Set<string>()
  let hasUntargetablePassiveRecord = false
  // Why: a workspace the user explicitly slept must not respawn every finished agent because a
  // phone opened it. Those panes cold-restore `--resume` when their own tab is opened, which is
  // also what the desktop does (#11598). Filtering before canonicalization keeps a lazy record
  // from winning — and deleting — the claim of a hibernated record that does need mounting.
  const backgroundWakeRecords = worktreeRecords.filter(
    (record) => record.restoreOnTabOpenOnly !== true
  )
  for (const record of getCanonicalPassiveWakeRecords(backgroundWakeRecords, wokenClaimKeys)) {
    const tabId = getSleepingRecordTabId(record)
    if (tabId) {
      passiveTabIds.add(tabId)
    } else {
      hasUntargetablePassiveRecord = true
    }
  }
  if (passiveTabIds.size > 0 || hasUntargetablePassiveRecord) {
    // Why: a record whose tab cannot be resolved falls back to the untargeted
    // whole-worktree mount rather than silently never waking.
    dispatchBackgroundMount(
      worktreeId,
      hasUntargetablePassiveRecord ? undefined : [...passiveTabIds]
    )
  }
  const launchedTabIds: string[] = []
  resumeSleepingAgentSessionsForWorktree(worktreeId, {
    suppressNavigation: true,
    skipClaimKeys: wokenClaimKeys,
    onSessionLaunched: (tabId) => launchedTabIds.push(tabId)
  })
  if (launchedTabIds.length > 0) {
    dispatchBackgroundMount(worktreeId, launchedTabIds)
  }
}
