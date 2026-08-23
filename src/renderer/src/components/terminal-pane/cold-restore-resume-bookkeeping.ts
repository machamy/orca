import type {
  AgentProviderSessionMetadata,
  ResumableTuiAgent
} from '../../../../shared/agent-session-resume'
import type { AppState } from '@/store/types'

/**
 * Fork: after a resume spawn lands. Record first (a resumed agent emits no
 * hook until its next event, and the spawn consumed the record it restored
 * from — without one the pane is not capturable by the next switch), then
 * seed the status row; seeding before the spawn would make the resume startup
 * treat the live entry as unusable and open a bare shell. The disposed guard
 * stays at the call site: it's live closure state read at settlement time.
 */
export function applyResumedAgentBookkeeping(
  store: Pick<AppState, 'recordAgentProviderSession' | 'agentStatusByPaneKey' | 'setAgentStatus'>,
  args: {
    cacheKey: string
    tabId: string
    worktreeId: string
    agent: ResumableTuiAgent
    providerSession: AgentProviderSessionMetadata
    launchToken?: string
  }
): void {
  store.recordAgentProviderSession(
    args.cacheKey,
    args.agent,
    args.providerSession,
    undefined,
    { tabId: args.tabId, worktreeId: args.worktreeId },
    { launchToken: args.launchToken }
  )
  if (!store.agentStatusByPaneKey[args.cacheKey]) {
    // The sidebar's agent rows come from live agent status, and tab.launchAgent
    // only demotes the tab to a muted terminal row — without a seeded row a
    // moved agent reads as a plain terminal after a switch.
    store.setAgentStatus(
      args.cacheKey,
      { state: 'done', prompt: '', agentType: args.agent, restoredUnconfirmed: true },
      undefined,
      undefined,
      { tabId: args.tabId, worktreeId: args.worktreeId },
      { providerSession: args.providerSession, launchToken: args.launchToken }
    )
  }
}
