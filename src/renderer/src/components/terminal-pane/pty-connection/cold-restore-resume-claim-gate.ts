import { useAppStore } from '@/store'
import { recordRendererCrashBreadcrumb } from '@/lib/crash-breadcrumb-recorder'
import {
  releaseAgentSessionResume,
  tryClaimAgentSessionResume
} from '@/lib/agent-provider-session-single-owner'
import { shouldClearResumeClaimLoserRecord } from '../cold-restore-resume-claim'
import { applyResumedAgentBookkeeping } from '../cold-restore-resume-bookkeeping'
import type { ConnectPanePtySession } from './connect-pane-pty-session'
import type { ColdRestoreAgentResumeStartup, FreshSpawnOptions } from './fresh-spawn-types'
import { startPaneThroughMainThenAttach } from './main-pane-start-request'

/** Fork: null when this pane wins the resume claim; otherwise its fresh-spawn fallback. */
export function startColdRestoreResumeClaimLoser(
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

/** Fork: release the claim once the spawn settles, then record which session the pane runs. */
export function trackClaimedColdRestoreResume(
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
