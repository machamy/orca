import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import type { AgentDotState } from '@/components/AgentStateDot'
import { getAgentDotState } from './worktree-card-agent-summary'

/** Which agent the collapsed pill names. Ordered by "who is the card asking me
 *  about": something running beats something waiting on me, and both beat a
 *  finished row. */
const FOCUS_PRIORITY: readonly AgentDotState[] = [
  'working',
  'blocked',
  'waiting',
  'interrupted',
  'failed',
  'idle',
  'done'
]

/**
 * Pick the one agent whose tab name the collapsed summary shows.
 *
 * Why name anything at all: the pill used to render only state dots, provider
 * icons and `+N`, so a card could say "three agents are busy" without saying
 * WHICH terminal — the user had to expand it to find out what was working.
 */
export function selectSummaryFocusAgent(
  agents: readonly DashboardAgentRowData[]
): DashboardAgentRowData | null {
  let best: DashboardAgentRowData | null = null
  let bestRank = Number.POSITIVE_INFINITY
  for (const agent of agents) {
    const rank = FOCUS_PRIORITY.indexOf(getAgentDotState(agent))
    const effective = rank === -1 ? FOCUS_PRIORITY.length : rank
    if (effective < bestRank) {
      best = agent
      bestRank = effective
      continue
    }
    // Ties go to the most recently active row, so a card with several working
    // agents names the one that moved last rather than an arbitrary one.
    if (effective === bestRank && best && agentActivityAt(agent) > agentActivityAt(best)) {
      best = agent
    }
  }
  return best
}

function agentActivityAt(agent: DashboardAgentRowData): number {
  return agent.entry.updatedAt ?? agent.entry.stateStartedAt ?? 0
}

/** The tab's own name, which is what the tab bar shows and therefore what the
 *  user needs in order to find it. */
export function summaryFocusAgentLabel(agent: DashboardAgentRowData): string {
  return (agent.tab.customTitle ?? agent.tab.title ?? '').trim()
}
