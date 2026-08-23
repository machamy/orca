// The full "make default worktree" client flow — sleep both sides (mode B /
// sleep-in-place), snapshot + queue the post-migration wake, run the swap, and
// recover on failure. Shared by the sidebar dialog confirm AND the CLI
// `worktree default set --follow-agents --ui-flow` request so headless E2E runs
// exercise the exact user path.
import { toast } from 'sonner'
import type { Worktree } from '../../../shared/worktree/types'
import type { RuntimeDefaultWorktreeSwitchResult } from '../../../shared/runtime-types'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  assertDefaultSwitchWorktreesResolve,
  setDefaultWorktree
} from '@/lib/default-worktree-switch-client'
import {
  buildDefaultSwitchNotice,
  deliverDefaultSwitchNotice
} from '@/lib/default-worktree-switch-agent-notice'
import {
  DEFAULT_SWITCH_NOTIFY_SCOPE,
  resolveDefaultSwitchNotifyTargets,
  type DefaultSwitchNotifyScope
} from '@/lib/default-worktree-switch-notify-scope'
import {
  clearDefaultSwitchWake,
  queueDefaultSwitchWake
} from '@/lib/default-worktree-switch-post-wake'
import {
  mountSwitchedWorktreeTabsInBatches,
  wakeSleepingAgentsForWorktreeInBackground
} from '@/lib/wake-sleeping-agents-in-background'
import { runSleepWorktrees } from '@/components/sidebar/sleep-worktree-flow'
import { recordRendererCrashBreadcrumb } from '@/lib/crash-breadcrumb-recorder'
import { cancelFollowSwitchPaneRespawn } from '@/lib/default-worktree-switch-pane-respawn'
import { armWorktreeIdentityGrace } from '@/store/worktree-identity-grace'
import {
  beginDefaultSwitchSleepGuard,
  beginDefaultSwitchTeardownWindow,
  isDefaultSwitchSleepGuarded,
  isInDefaultSwitchTeardownWindow,
  endDefaultSwitchSleepGuard,
  endDefaultSwitchTeardownWindow
} from '@/lib/default-worktree-switch-sleep-guard'
import { waitForDefaultSwitchReadiness } from '@/lib/default-worktree-switch-readiness'

export type DefaultWorktreeSwitchFlowRequest = {
  source: Worktree
  currentDefault: Worktree
}

export type DefaultWorktreeSwitchFlowOptions = {
  agentsFollow: boolean
  notifyAgents: boolean
  notifyScope?: DefaultSwitchNotifyScope
  sleepInPlace: boolean
  /** Carry untracked files with their branch (default). False leaves them in
   *  the folder they are in now. */
  includeUntracked?: boolean
}

/** Comfortably inside the shorter guard TTL even when Electron throttles a
 *  backgrounded window's timers — the user minimising the app mid-swap is the
 *  normal case, not the exception. */
const HEARTBEAT_INTERVAL_MS = 5_000

export async function runDefaultWorktreeSwitchFlow(
  request: DefaultWorktreeSwitchFlowRequest,
  options: DefaultWorktreeSwitchFlowOptions
): Promise<RuntimeDefaultWorktreeSwitchResult> {
  const swappedIds = [request.source.id, request.currentDefault.id]
  // Owner token for the in-flight marker: null until the display marker is
  // published, upgraded in place at admission. Every release below presents it,
  // so this flow can only ever take down its own claim.
  let switchToken: string | null = null
  // Keeps the marker and both guards alive across a swap that legitimately runs
  // for minutes. Cleared in the finally below.
  let heartbeat: ReturnType<typeof setInterval> | undefined
  // Mode B (follow) always sleeps so agents can be resumed at swapped paths;
  // Mode A sleeps only when the user picked the in-place safety option.
  const mustSleep = options.agentsFollow || options.sleepInPlace
  if (mustSleep) {
    // Why the wait: sleeping an agent that has not reported a session yet (a
    // codex still booting MCP after a previous switch) captures nothing — the
    // tab moves recordless and wakes as a bare shell. Wait for any in-flight
    // switch and for every live agent pane to become capturable; abort with
    // the offending tabs named rather than proceed into agent loss.
    // The indicator starts here rather than at the claim below: the readiness
    // wait alone can run 45s, and until now it showed nothing at all.
    // Not admitted yet: this marker exists only so the card can say what the
    // flow is waiting for. Admission happens after readiness returns.
    switchToken = useAppStore.getState().claimDefaultSwitch(swappedIds, {
      admitted: false,
      progress: { phase: 'waiting-for-agents' }
    })
    const readiness = await waitForDefaultSwitchReadiness(swappedIds, (pending) => {
      useAppStore.getState().setDefaultSwitchProgress(
        {
          phase: 'waiting-for-agents',
          ...(pending[0] ? { detail: pending[0].title } : {})
        },
        switchToken
      )
    })
    if (!readiness.ready) {
      toast.error(
        translate('auto.lib.defaultWorktreeSwitchFlow.notReadyTitle', 'Default switch postponed'),
        {
          description: translate(
            'auto.lib.defaultWorktreeSwitchFlow.switchInFlight',
            'Another default switch is still finishing. Try again in a moment.'
          ),
          duration: 10_000
        }
      )
      recordRendererCrashBreadcrumb('mode_b_not_ready', { reason: readiness.reason })
      // Owner-checked: this may only take down our own display marker. The
      // unconditional clear here erased the WINNING switch's claim mid-git,
      // which blanked its card and un-gated the user's next click.
      useAppStore.getState().releaseDefaultSwitch(switchToken)
      throw new Error('default_worktree_switch_not_ready')
    }
    if (readiness.unready && readiness.unready.length > 0) {
      // Proceed, but say so: these agents had no capturable session, so they
      // move with their tab and split intact and resume on a fresh session.
      toast.warning(
        translate(
          'auto.lib.defaultWorktreeSwitchFlow.agentsNotReadyTitle',
          'Some agents move without their session'
        ),
        {
          description: translate(
            'auto.lib.defaultWorktreeSwitchFlow.agentsNotReady',
            'These agents had not reported a resumable session yet, so they move with their tab but start a new session: {{tabs}}.',
            { tabs: readiness.unready.map((pane) => pane.title).join(', ') }
          ),
          duration: 10_000
        }
      )
      recordRendererCrashBreadcrumb('mode_b_unready_proceed', {
        tabs: readiness.unready.map((pane) => pane.tabId.slice(0, 8)).join(',')
      })
    }
    // Why before anything is slept: the host resolves the selector itself, so a
    // card the runtime has already purged threw `selector_not_found` only after
    // both sides had been put to sleep — agents went down for a switch that
    // could never run. And why before the claim: this awaits, and an await
    // between the admission check and the claim reopened the double-admission
    // window the claim exists to close.
    await assertDefaultSwitchWorktreesResolve(swappedIds)
    // Compare-and-set: succeeds only when no LIVE blocking claim by another
    // owner exists, in one synchronous store update — the check and the claim
    // can no longer be interleaved by a rival's await.
    switchToken = useAppStore.getState().claimDefaultSwitch(swappedIds, {
      admitted: true,
      ...(switchToken ? { token: switchToken } : {}),
      progress: { phase: 'sleeping' }
    })
    if (!switchToken) {
      recordRendererCrashBreadcrumb('mode_b_admission_lost', { ids: swappedIds.join(',') })
      toast.error(
        translate('auto.lib.defaultWorktreeSwitchFlow.notReadyTitle', 'Default switch postponed'),
        {
          description: translate(
            'auto.lib.defaultWorktreeSwitchFlow.switchInFlight',
            'Another default switch is still finishing. Try again in a moment.'
          ),
          duration: 10_000
        }
      )
      throw new Error('default_worktree_switch_not_ready')
    }
    // Why here and not at the wake: the previous switch's sweeps used to survive
    // until this one woke, so they fired DURING this sleep — and because they
    // check ownership against the teardown window this switch just armed for the
    // same ids, they read as owned, deleted the PTY bindings this switch is
    // about to reattach, and the sleep guard then refused the replacement spawn.
    cancelFollowSwitchPaneRespawn(swappedIds)
    // Why the guard: still-mounted panes react to the sleep's PTY kill with an
    // immediate cold-restore, consuming the fresh resume records and
    // relaunching the agents in place — the switch's own wake must be the one
    // to resume them. Lifted before every wake below (and TTL-bounded).
    beginDefaultSwitchSleepGuard(swappedIds)
    // Outlives the guard above: the sleep's PTY kills land after the wake lifts
    // it, and an unsuppressed exit closes panes (and single-pane tabs) outright.
    beginDefaultSwitchTeardownWindow(swappedIds)
    // Why the pulse starts HERE and not after the sleep: the guard's whole
    // reason for existing is the moment the sleep kills the PTYs, and a pulse
    // created afterwards leaves exactly that window unattended — a sleep longer
    // than the guard's TTL (many panes, a remote host) let mounted panes
    // cold-restore the records the sleep had just captured.
    // Only ever RE-arms a guard that is still armed: the wake lifts these
    // deliberately, and re-arming past that point re-blocked the respawns and
    // left panes empty.
    heartbeat = setInterval(() => {
      const state = useAppStore.getState()
      const marker = state.defaultSwitchInFlight
      // The wake owns the flow once it starts reporting stages; keeping the
      // pulse alive past that overwrote its phase and resurrected its guards.
      if (!switchToken || marker?.token !== switchToken) {
        return
      }
      state.touchDefaultSwitchHeartbeat(switchToken)
      for (const worktreeId of swappedIds) {
        if (isDefaultSwitchSleepGuarded(worktreeId)) {
          beginDefaultSwitchSleepGuard([worktreeId])
        }
        if (isInDefaultSwitchTeardownWindow(worktreeId)) {
          beginDefaultSwitchTeardownWindow([worktreeId])
        }
      }
    }, HEARTBEAT_INTERVAL_MS)
    const { failedWorktreeIds } = await runSleepWorktrees(swappedIds, {
      preserveBrowserState: true
    })
    if (options.agentsFollow) {
      // TEMP mode-B diagnostics: how many slept records the sleep just
      // captured per side — 0 here means the wake has nothing to resume.
      const sleeping = Object.values(useAppStore.getState().sleepingAgentSessionsByPaneKey ?? {})
      recordRendererCrashBreadcrumb('mode_b_sleep', {
        source: request.source.id,
        currentDefault: request.currentDefault.id,
        sleptFailed: failedWorktreeIds.length,
        sourceRecords: sleeping.filter((r) => r.worktreeId === request.source.id).length,
        defaultRecords: sleeping.filter((r) => r.worktreeId === request.currentDefault.id).length,
        sleepingTotal: sleeping.length
      })
    }
    if (failedWorktreeIds.length > 0) {
      endDefaultSwitchSleepGuard(swappedIds)
      endDefaultSwitchTeardownWindow(swappedIds)
      useAppStore.getState().releaseDefaultSwitch(switchToken)
      // The sleep is per-worktree and keeps going after one side fails, so the
      // other side is already shut down. Refusing the swap without waking it
      // left its terminals and agents dead with nothing to bring them back.
      // The generic wake alone is not enough: it returns immediately when the
      // worktree has no agent records, leaving its plain shells unmounted.
      for (const worktreeId of swappedIds) {
        if (!failedWorktreeIds.includes(worktreeId)) {
          wakeSleepingAgentsForWorktreeInBackground(worktreeId)
          mountSwitchedWorktreeTabsInBatches(worktreeId)
        }
      }
      throw new Error('default_worktree_switch_sleep_failed')
    }
    if (options.agentsFollow) {
      // Follow: the runtime swaps session content between the two workspaces,
      // then the worktrees:changed migrations handler activates the promoted
      // default (so its followed agents restore in their panes) and wakes both.
      // Snapshot the just-captured records: swap-window state churn has been
      // observed deleting them before the wake, so the consumer re-seeds any
      // that went missing. Shield both ids so list-refresh races during the
      // swap can't read the identity change as a deletion and purge state.
      const capturedRecords = Object.values(
        useAppStore.getState().sleepingAgentSessionsByPaneKey ?? {}
      ).filter((record) => swappedIds.includes(record.worktreeId))
      armWorktreeIdentityGrace(swappedIds)
      queueDefaultSwitchWake(swappedIds, request.currentDefault.id, capturedRecords)
    }
  }
  try {
    useAppStore.getState().setDefaultSwitchProgress(
      {
        phase: 'swapping-branches',
        detail: request.source.displayName
      },
      switchToken
    )
    const result = await setDefaultWorktree(request.source.id, {
      followAgents: options.agentsFollow,
      notifyAgents: options.notifyAgents,
      includeUntracked: options.includeUntracked !== false
    })
    if (mustSleep && !options.agentsFollow) {
      // Mode A in-place: wake here, at the same worktrees.
      endDefaultSwitchSleepGuard(swappedIds)
      endDefaultSwitchTeardownWindow(swappedIds)
      useAppStore.getState().releaseDefaultSwitch(switchToken)
      for (const worktreeId of swappedIds) {
        wakeSleepingAgentsForWorktreeInBackground(worktreeId)
      }
    }
    toast.success(
      translate(
        'auto.components.sidebar.WorktreeList.defaultWorktreeSwitched',
        'Default worktree switched'
      )
    )
    if (result.checkoutWarnings && result.checkoutWarnings.length > 0) {
      // The branches landed, but a hook or filter reported an error mid-way —
      // the tree may be incomplete, and the captured work was kept in rescue
      // refs on purpose. Saying nothing here would read as a clean switch.
      toast.warning(
        translate(
          'auto.lib.defaultWorktreeSwitchFlow.checkoutWarnedTitle',
          'Switch finished with git warnings'
        ),
        {
          description: translate(
            'auto.lib.defaultWorktreeSwitchFlow.checkoutWarned',
            'Check the files in both worktrees. Your uncommitted work is also kept at: {{refs}}',
            { refs: (result.retainedRescueRefs ?? []).join(', ') || '-' }
          ),
          duration: 15_000
        }
      )
    }
    if (options.notifyAgents) {
      // Why the agents and not only the toast: the option's own hint promises
      // each affected agent is seeded with a note, but it used to raise a toast
      // for the human and nothing else — a moved agent kept reasoning about the
      // path it started in, with no way to learn its branch had changed.
      // Each side hears only where IT landed: the repo default path now holds the
      // promoted branch, and the selected worktree holds the demoted one.
      const noticeByWorktreeId = {
        [request.currentDefault.id]: buildDefaultSwitchNotice({
          path: result.defaultPath,
          branch: result.promotedBranch
        }),
        [request.source.id]: buildDefaultSwitchNotice({
          path: result.selectedPath,
          branch: result.demotedBranch
        })
      }
      deliverDefaultSwitchNotice({
        worktreeIds: resolveDefaultSwitchNotifyTargets({
          scope: options.notifyScope ?? DEFAULT_SWITCH_NOTIFY_SCOPE,
          sourceWorktreeId: request.source.id,
          currentDefaultWorktreeId: request.currentDefault.id
        }),
        noticeFor: (worktreeId) => noticeByWorktreeId[worktreeId] ?? '',
        getState: () => useAppStore.getState(),
        write: (ptyId, data) => window.api.pty.write(ptyId, data)
      })
      toast.info(
        translate(
          'auto.components.sidebar.WorktreeList.defaultWorktreeSwitchedNotify',
          '{{repoPath}} is now on {{promoted}}; {{selectedPath}} is now on {{demoted}}.',
          {
            repoPath: result.defaultPath,
            promoted: result.promotedBranch,
            selectedPath: result.selectedPath,
            demoted: result.demotedBranch
          }
        ),
        { duration: 10_000 }
      )
    }
    return result
  } catch (error) {
    // TEMP mode-B diagnostics: a live run showed a switch failing before any
    // git ran, with no record of why — capture the error for the trace.
    recordRendererCrashBreadcrumb('mode_b_error', {
      message: String(error instanceof Error ? error.message : error).slice(0, 200)
    })
    if (mustSleep) {
      // The swap never ran; wake the slept agents back where they were.
      endDefaultSwitchSleepGuard(swappedIds)
      endDefaultSwitchTeardownWindow(swappedIds)
      useAppStore.getState().releaseDefaultSwitch(switchToken)
      clearDefaultSwitchWake()
      for (const worktreeId of swappedIds) {
        wakeSleepingAgentsForWorktreeInBackground(worktreeId)
      }
    }
    throw error
  } finally {
    if (heartbeat !== undefined) {
      clearInterval(heartbeat)
    }
  }
}
