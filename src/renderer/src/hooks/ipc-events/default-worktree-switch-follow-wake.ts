import { recordRendererCrashBreadcrumb } from '@/lib/crash-breadcrumb-recorder'
import { filterReseedableSleepingRecords } from '@/lib/agent-provider-session-single-owner'
import { createDefaultSwitchCompletionGate } from '@/lib/default-worktree-switch-completion-gate'
import { scheduleFollowSwitchPaneRespawn } from '@/lib/default-worktree-switch-pane-respawn'
import {
  consumeDefaultSwitchWake,
  type ConsumedDefaultSwitchWake
} from '@/lib/default-worktree-switch-post-wake'
import {
  beginDefaultSwitchTeardownWindow,
  endDefaultSwitchSleepGuard,
  endDefaultSwitchTeardownWindow,
  isInDefaultSwitchTeardownWindow
} from '@/lib/default-worktree-switch-sleep-guard'
import { remapOpenEditorTabsForPathChange } from '@/lib/remap-open-editor-tabs-for-path-change'
import { wakeFollowedSleptAgentsForWorktree } from '@/lib/wake-sleeping-agents-in-background'
import { splitWorktreeIdForFilesystem } from '../../../../shared/worktree/id'
import type { RuntimeWorktreeIdentityMigration } from '../../../../shared/runtime-worktree-contracts'
import { useAppStore } from '../../store'

/**
 * Fork (mode-B "agents follow their branch"): the tail of the worktrees:changed
 * handler that runs AFTER the identity migrations swapped session content
 * between the two workspaces, so each slept agent wakes in the worktree that
 * now holds its branch. No-ops unless this event's migrations touch the pair
 * the switch queued.
 */
export function runDefaultWorktreeSwitchFollowWake(
  identityMigrations: readonly RuntimeWorktreeIdentityMigration[]
): void {
  const followWake = consumeDefaultSwitchWake(identityMigrations)
  if (identityMigrations.length > 0) {
    // Diagnostics: one real follow switch has to reveal whether the migrations
    // arrived, the wake fired, and whether any slept records survived under the
    // post-migration ids — none of which is reconstructable after the fact.
    const sleeping = Object.values(useAppStore.getState().sleepingAgentSessionsByPaneKey ?? {})
    recordRendererCrashBreadcrumb('mode_b_follow', {
      migrations: identityMigrations.length,
      migrOld0: identityMigrations[0]?.oldWorktreeId ?? null,
      migrNew0: identityMigrations[0]?.newWorktreeId ?? null,
      wakeFired: followWake.worktreeIds.length,
      activate: followWake.activateWorktreeId,
      sleepingTotal: sleeping.length,
      recordWorktreeIds: [...new Set(sleeping.map((r) => r.worktreeId))].join(' | ') || null
    })
  }
  if (followWake.worktreeIds.length === 0) {
    return
  }
  reseedRecordsLostToSwapChurn(followWake)
  rekeyOpenEditorTabsThroughSwap(identityMigrations)
  // Panes with no sleeping record (plain shells) still hold PTY ids that embed
  // the pre-swap worktree — the sleep killed those sessions, and a pane that
  // attaches to one paints nothing and gets reconciled closed, losing its tab
  // or its split sibling. Drop the ids so they respawn.
  const releasedShellTabs = useAppStore
    .getState()
    .releaseFollowSwitchShellPtyBindings(followWake.worktreeIds)
  if (releasedShellTabs > 0) {
    recordRendererCrashBreadcrumb('mode_b_shell_release', { tabs: releasedShellTabs })
  }
  // The switch's own wake is about to run — lift the sleep guard so its mounts
  // can cold-restore. Scoped to this switch: a global wipe disarmed a DIFFERENT
  // switch's guards, so its still-landing PTY kills took the unsuppressed branch.
  endDefaultSwitchSleepGuard(followWake.worktreeIds)
  // Activate the promoted worktree first: cold-restore only surfaces a working
  // agent in its own pane when its worktree is active — otherwise the resume
  // forks a hidden background tab and the move looks like loss.
  if (followWake.activateWorktreeId) {
    useAppStore.getState().setActiveWorktree(followWake.activateWorktreeId)
  }
  wakeAndRepairPanes(followWake)
}

function reseedRecordsLostToSwapChurn(followWake: ConsumedDefaultSwitchWake): void {
  // Swap-window state churn has been observed deleting the fresh sleeping
  // records before this point (observed live: 2 captured -> 0 by wake).
  const state = useAppStore.getState()
  // Why session-aware and not paneKey-absence alone: a record that was
  // legitimately CONSUMED (forked to a new tab, resumed under another paneKey)
  // also leaves its old paneKey empty, and reseeding it minted a second record
  // for the same provider session — observed live as one Claude session open in
  // two panes.
  const missingRecords = filterReseedableSleepingRecords(
    followWake.records,
    state.sleepingAgentSessionsByPaneKey,
    Object.values(state.agentStatusByPaneKey).map((entry) => ({
      worktreeId: entry.worktreeId,
      agent: entry.agentType,
      providerSession: entry.providerSession,
      state: entry.state
    }))
  )
  if (missingRecords.length === 0) {
    return
  }
  recordRendererCrashBreadcrumb('mode_b_reseed', {
    missing: missingRecords.length,
    snapshot: followWake.records.length
  })
  state.reseedSleepingAgentSessions(missingRecords)
}

/**
 * Open editor tabs follow their branch too: their absolute filePath (and the
 * id-keyed satellite state) still points into the old home, so files fail to
 * load — or silently show the OTHER branch — after the swap.
 */
function rekeyOpenEditorTabsThroughSwap(
  identityMigrations: readonly RuntimeWorktreeIdentityMigration[]
): void {
  if (identityMigrations.length !== 3) {
    return
  }
  const selPath = splitWorktreeIdForFilesystem(identityMigrations[0].oldWorktreeId)?.worktreePath
  const tempPath = splitWorktreeIdForFilesystem(identityMigrations[0].newWorktreeId)?.worktreePath
  const defaultPath = splitWorktreeIdForFilesystem(
    identityMigrations[1].oldWorktreeId
  )?.worktreePath
  if (!selPath || !tempPath || !defaultPath) {
    return
  }
  const defaultWorktreeId = identityMigrations[2].newWorktreeId
  const selWorktreeId = identityMigrations[1].newWorktreeId
  const steps = [
    { fromPath: selPath, toPath: tempPath, worktreeId: defaultWorktreeId },
    { fromPath: defaultPath, toPath: selPath, worktreeId: selWorktreeId },
    { fromPath: tempPath, toPath: defaultPath, worktreeId: defaultWorktreeId }
  ]
  for (const step of steps) {
    const rekeyed = remapOpenEditorTabsForPathChange({
      fromPath: step.fromPath,
      toPath: step.toPath,
      worktreePath: step.toPath,
      worktreeId: step.worktreeId,
      includeRefScopedDiffTabs: true
    })
    if (!rekeyed.ok) {
      recordRendererCrashBreadcrumb('mode_b_editor_rekey_failed', { reason: rekeyed.reason })
      break
    }
  }
}

function wakeAndRepairPanes(followWake: ConsumedDefaultSwitchWake): void {
  // The gates act on the in-flight marker with its OWNER token, captured now: a
  // fallback timer surviving from a superseded switch used to clear the NEXT
  // switch's claim mid-git. If the marker is not ours, every gate action no-ops.
  const wakeMarker = useAppStore.getState().defaultSwitchInFlight
  const wakeToken =
    wakeMarker && followWake.worktreeIds.every((id) => wakeMarker.worktreeIds.includes(id))
      ? wakeMarker.token
      : null
  const verifiedGate = createDefaultSwitchCompletionGate(followWake.worktreeIds, () =>
    useAppStore.getState().downgradeDefaultSwitchBlocking(wakeToken, { phase: 'verifying' })
  )
  const settleGate = createDefaultSwitchCompletionGate(
    followWake.worktreeIds,
    () => useAppStore.getState().releaseDefaultSwitch(wakeToken),
    // The last sweep lands 75s after the wake; give it a margin and then release
    // regardless, so a sweep that never reports cannot pin the flow.
    { fallbackAfterMs: 105_000 }
  )
  useAppStore.getState().setDefaultSwitchProgress({ phase: 'restoring' }, wakeToken)
  for (const worktreeId of followWake.worktreeIds) {
    wakeFollowedSleptAgentsForWorktree(worktreeId)
  }
  // The rebuild races the teardown: panes can land mounted with no PTY and
  // nothing retries them. Re-arm the window for the whole recovery — a git swap
  // longer than its TTL left every sweep disowned and the panes empty.
  beginDefaultSwitchTeardownWindow(followWake.worktreeIds)
  scheduleFollowSwitchPaneRespawn(followWake.worktreeIds, {
    // Why: a sweep that outlives the teardown window would remount panes whose
    // exits are no longer suppressed, and the exit closes single-pane tabs.
    isOwned: () =>
      followWake.worktreeIds.some((worktreeId) => isInDefaultSwitchTeardownWindow(worktreeId)),
    getState: () => useAppStore.getState(),
    remountTab: (tabId) => {
      // Why: a short tab's leaves still name the sessions the sleep killed. The
      // ids pass the ownership check after a swap-back (they embed the current
      // worktree), so the remount would REATTACH to a dead session and stay blank.
      useAppStore.getState().clearDeadLeafPtyBindings([tabId])
      useAppStore.getState().remountTerminalTabForRecovery(tabId)
    },
    onSweep: (tabIds, attempt) => {
      // Without a stage the card looked finished while panes were still coming back.
      useAppStore.getState().setDefaultSwitchProgress({ phase: 'settling' }, wakeToken)
      recordRendererCrashBreadcrumb('mode_b_respawn_sweep', {
        attempt,
        tabs: tabIds.map((id) => id.slice(0, 8)).join(',')
      })
    },
    // Hand teardown back once recovery is done rather than letting the window
    // run out: a real exit inside it is swallowed with no sweep left to repair
    // the pane, so the tab stays present but dead.
    onSweepFoundNothing: (worktreeId) => {
      verifiedGate.complete(worktreeId)
    },
    onSweepsComplete: (worktreeId) => {
      endDefaultSwitchTeardownWindow([worktreeId])
      settleGate.complete(worktreeId)
    }
  })
}
