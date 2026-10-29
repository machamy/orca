import type React from 'react'
import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import { DEFAULT_SWITCH_IN_FLIGHT_STALE_MS } from '@/lib/default-worktree-switch-readiness'
import { WorktreeCardSwitchStageRow } from './worktree-card-switch-stage-row'

/** Fork: the card's extra rows — the default-switch stage and terminal tabs no agent row covers. */
export function useWorktreeCardForkRows(
  worktreeId: string,
  agents: readonly DashboardAgentRowData[]
): { movingIndicator: React.JSX.Element | null; uncoveredTabs: TerminalTab[] } {
  // Why keep a boolean here: the card must still render (with the stage row)
  // when a switch has slept its agents and there are no rows to show yet.
  const switchInFlight = useAppStore((s) => {
    const inFlight = s.defaultSwitchInFlight
    return Boolean(
      inFlight &&
      inFlight.worktreeIds.includes(worktreeId) &&
      Date.now() - inFlight.startedAt < DEFAULT_SWITCH_IN_FLIGHT_STALE_MS
    )
  })
  // Why: terminal tabs with no agent row (bare shells, dead agents, agents
  // still booting before their first hook) were invisible in the sidebar —
  // open windows must be discoverable from the card, not only agent activity.
  const terminalTabs = useAppStore((s) => s.tabsByWorktree[worktreeId])
  const uncoveredTabs = useMemo(() => {
    const covered = new Set(agents.map((agent) => agent.tab.id))
    // Plain unnamed shells stay hidden — only agent tabs (dead or still booting
    // before their first hook) and user-titled tabs are worth a sidebar row.
    return (terminalTabs ?? []).filter(
      (tab) => !covered.has(tab.id) && (tab.launchAgent || tab.customTitle)
    )
  }, [agents, terminalTabs])

  // Why not only when the card is empty: rows survive a switch (retained and
  // title-derived ones), and gating on an empty card meant the busiest cards —
  // the ones whose agents are actually moving — showed nothing at all for the
  // minute the switch takes. The stage belongs above whatever rows remain.
  const movingIndicator = switchInFlight ? (
    <WorktreeCardSwitchStageRow worktreeId={worktreeId} />
  ) : null
  return { movingIndicator, uncoveredTabs }
}
