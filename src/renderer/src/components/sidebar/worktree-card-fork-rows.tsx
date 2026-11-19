import type React from 'react'
import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/rows/dashboard-agent-row'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import { useWorktreeAgentRows } from './workspace-card/activity/useWorktreeAgentRows'
import type { TerminalTab } from '../../../../shared/workspace-layout/terminal-tab-types'
import { DEFAULT_SWITCH_IN_FLIGHT_STALE_MS } from '@/lib/default-worktree-switch-readiness'
import { WorktreeCardSwitchStageRow } from './worktree-card-switch-stage-row'
import { WorktreeCardTerminalTabRows } from './worktree-card-terminal-tab-rows'

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

/** Fork: upstream's agent body wrapped with the switch stage row and uncovered terminal tabs. */
export function WorktreeCardWithForkRows({
  worktreeId,
  executionHostId,
  className,
  renderBody
}: {
  worktreeId: string
  executionHostId?: ExecutionHostId
  className?: string
  renderBody: ((className?: string) => React.JSX.Element) | null
}): React.JSX.Element | null {
  const agents = useWorktreeAgentRows(worktreeId, true, executionHostId)
  const { movingIndicator, uncoveredTabs } = useWorktreeCardForkRows(worktreeId, agents)
  if (!movingIndicator && uncoveredTabs.length === 0) {
    return renderBody?.(className) ?? null
  }
  return (
    <div className={className}>
      {movingIndicator}
      {renderBody?.()}
      <WorktreeCardTerminalTabRows worktreeId={worktreeId} tabs={uncoveredTabs} />
    </div>
  )
}
