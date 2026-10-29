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
import { isWorkspaceSleepRecord } from '../../../shared/workspace-sleep'
import { resumeSleepingAgentSessionsForWorktree } from './resume-sleeping-agent-session'
import { getSleepingRecordTabId } from './sleeping-agent-wake-requests'
import { resolveActivationPtyListScope } from './worktree-activation-pty-inventory'
import { gateWorktreeAgentActivation } from './worktree-agent-activation-gate'
import {
  getProviderSessionClaimKey,
  activationTreatsNoteAsFinished,
  isStrandedWorkspaceSleepRecord,
  recordPaneIsOwnedByPreservedPane
} from './sleeping-agent-pane-ownership'

type BackgroundSleepingAgentWakeDispatcherOptions = {
  isWorkspaceSessionReady?: () => boolean
  subscribeToStore?: (listener: () => void) => () => void
  wake?: (worktreeId: string) => void
}

/** Buffer main’s one-shot mobile wake until sleeping records hydrate; early listener attachment otherwise drops the only event and leaves frozen panes. */
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
      .filter((record) => !activationTreatsNoteAsFinished(record))
      .map(getProviderSessionClaimKey)
  )
  const recordsByClaim = new Map<string, SleepingAgentSessionRecord[]>()
  for (const record of records) {
    if (!activationTreatsNoteAsFinished(record)) {
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
        // Canonicalize provider sessions before cold panes mount after event claims expire, preventing duplicate resumes.
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

/** Wake mobile-visible sleepers without desktop navigation: wake mounted hibernated panes and collect claims; target-mount unmounted passive hibernation tabs; resume other records without navigation, skipping claims; mount those activate:false resume tabs so startup reaches PTYs. Skip restoreOnTabOpenOnly records to preserve explicit sleep. PTYs republish automatically, so await no spawn. */
export function wakeSleepingAgentsForWorktreeInBackground(worktreeId: string): void {
  const sleptRecords = Object.values(useAppStore.getState().sleepingAgentSessionsByPaneKey).filter(
    (record) => record.worktreeId === worktreeId
  )
  // No sleepers means no mounting: phone browsing must not accumulate desktop workspaces/PTYS.
  if (sleptRecords.length === 0) {
    return
  }

  // Why all records: a workspace sleep's still-mounted panes wake here too, through main's resume.
  const wokenClaimKeys = new Set<string>()
  window.dispatchEvent(
    new CustomEvent<WakeHibernatedAgentsWorktreeDetail>(WAKE_HIBERNATED_AGENTS_WORKTREE_EVENT, {
      detail: { worktreeId, wokenClaimKeys }
    })
  )
  // Why: main resumes a workspace sleep's placed records; the steps below are the window's own hibernation and stranded sleeps.
  const state = useAppStore.getState()
  const worktreeRecords = sleptRecords.filter(
    (record) => !isWorkspaceSleepRecord(record) || isStrandedWorkspaceSleepRecord(record, state)
  )
  if (worktreeRecords.length === 0) {
    return
  }
  // Only passive completed-hibernation records need fresh-connect mounting; nonpassive recovery creates/mounts new tabs later.
  const passiveTabIds = new Set<string>()
  let hasUntargetablePassiveRecord = false
  // Phone workspace opens must preserve explicit sleep until each tab opens (#11598). Filter before canonicalization so lazy records cannot steal/delete active hibernation claims.
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
    // If tab identity is unresolved, mount the whole workspace rather than strand recovery.
    dispatchBackgroundMount(
      worktreeId,
      hasUntargetablePassiveRecord ? undefined : [...passiveTabIds]
    )
  }
  const resumeOptions = {
    suppressNavigation: true,
    skipClaimKeys: wokenClaimKeys,
    // Mirror-deferred sweeps replay after this call; request each tab’s mount instead of collecting one early batch.
    onSessionLaunched: (tabId: string) => dispatchBackgroundMount(worktreeId, [tabId])
  }
  // Inactive panes look unowned locally even with live host PTYs; require host inventory to prove exit (STA-3859). Paired runtimes instead retain per-pane mirror parking.
  if (resolveActivationPtyListScope(useAppStore.getState(), worktreeId)) {
    void gateWorktreeAgentActivation(worktreeId, resumeOptions)
    return
  }
  resumeSleepingAgentSessionsForWorktree(worktreeId, resumeOptions)
}
