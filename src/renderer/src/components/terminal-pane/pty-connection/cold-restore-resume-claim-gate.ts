import { useAppStore } from '@/store'
import { recordRendererCrashBreadcrumb } from '@/diagnostics/crash-reporting/crash-breadcrumb-recorder'
import {
  releaseAgentSessionResume,
  tryClaimAgentSessionResume
} from '@/lib/agent-provider-session-single-owner'
import { shouldClearResumeClaimLoserRecord } from '../cold-restore-resume-claim'
import { applyResumedAgentBookkeeping } from '../cold-restore-resume-bookkeeping'
import type { ConnectPanePtySession } from './connect-pane-pty-session'
import type { ColdRestoreAgentResumeStartup, FreshSpawnOptions } from './startup/fresh-spawn-types'
import { startPaneThroughMainThenAttach } from './spawn/main-pane-start-request'

/** Fork: only the pane that wins the provider-session claim resumes; the rest start fresh. */
export function startClaimGatedColdRestoreResume(
  session: ConnectPanePtySession,
  startup: ColdRestoreAgentResumeStartup | null,
  options: FreshSpawnOptions,
  startClaimedResume: () => Promise<string | null>
): Promise<string | null> {
  const claimLoser = startColdRestoreResumeClaimLoser(session, startup, options)
  if (claimLoser) {
    return claimLoser
  }
  const spawned = startClaimedResume()
  if (startup) {
    trackClaimedColdRestoreResume(session, startup, spawned)
  }
  return spawned
}

/** Null when this pane wins the resume claim; otherwise its fresh-spawn fallback. */
function startColdRestoreResumeClaimLoser(
  session: ConnectPanePtySession,
  startup: ColdRestoreAgentResumeStartup | null,
  options: FreshSpawnOptions
): Promise<string | null> | null {
  if (!startup || tryClaimAgentSessionResume(startup.agent, startup.resumeProviderSession)) {
    return null
  }
  // Another pane already resumes this session; without the gate a wake burst spawned two `--resume`s.
  recordRendererCrashBreadcrumb('resume_claim_lost', {
    agent: startup.agent,
    session: (startup.resumeProviderSession?.id ?? '').slice(-10)
  })
  const paneKeyToClear = shouldClearResumeClaimLoserRecord(
    session.getSleepingRecordForPane(useAppStore.getState()),
    startup
  )
  if (paneKeyToClear) {
    useAppStore.getState().clearSleepingAgentSession(paneKeyToClear)
  }
  return startPaneThroughMainThenAttach(session, () => session.startFreshSpawn(null, options))
}

/** Release the claim once the spawn settles, then record which session the pane runs. */
function trackClaimedColdRestoreResume(
  session: ConnectPanePtySession,
  startup: ColdRestoreAgentResumeStartup,
  spawned: Promise<string | null>
): void {
  void spawned.finally(() =>
    releaseAgentSessionResume(startup.agent, startup.resumeProviderSession)
  )
  // A resumed agent emits no hook until its next event, so nothing else would know its session.
  void spawned.then((spawnedPtyId) => {
    if (!spawnedPtyId || session.disposed) {
      return
    }
    applyResumedAgentBookkeeping(useAppStore.getState(), {
      cacheKey: session.cacheKey,
      tabId: session.deps.tabId,
      worktreeId: session.deps.worktreeId,
      agent: startup.agent,
      providerSession: startup.resumeProviderSession,
      launchToken: startup.launchToken
    })
  })
}
