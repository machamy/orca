import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { CompactAgentSummaryButton } from './worktree-card-compact-agents'

function makeAgent(state: string, tabTitle: string, updatedAt = 0): DashboardAgentRowData {
  return {
    paneKey: `${tabTitle}:leaf`,
    agentType: 'claude',
    state,
    tab: { id: tabTitle, title: tabTitle, customTitle: null },
    entry: { updatedAt, stateStartedAt: updatedAt }
  } as unknown as DashboardAgentRowData
}

function renderCollapsed(agents: DashboardAgentRowData[]): string {
  return renderToStaticMarkup(
    React.createElement(CompactAgentSummaryButton, {
      agents,
      subjectLabel: 'agents',
      expanded: false,
      onToggle: () => {}
    })
  )
}

describe('collapsed agent summary', () => {
  it('names the working tab instead of only counting agents', () => {
    // The pill used to render state dots, provider icons and `+N` only, so the
    // card could say three agents are busy without saying which terminal.
    const markup = renderCollapsed([
      makeAgent('done', 'T2-셸'),
      makeAgent('working', 'T1-클로드', 20),
      makeAgent('idle', 'T3-분할')
    ])

    expect(markup).toContain('T1-클로드')
    // Exactly one count, and it counts the other AGENTS — not hidden icons.
    expect(markup.match(/\+\d/g)).toEqual(['+2'])
    expect(markup).not.toContain('T2-셸')
  })

  it('says nothing extra when a single agent is already named', () => {
    const markup = renderCollapsed([makeAgent('working', 'solo', 5)])

    expect(markup).toContain('solo')
    expect(markup).not.toContain('+1')
  })

  it('keeps the name out of the expanded header, which already has one', () => {
    const markup = renderToStaticMarkup(
      React.createElement(CompactAgentSummaryButton, {
        agents: [makeAgent('working', 'T1-클로드', 5)],
        subjectLabel: 'agents',
        expanded: true,
        onToggle: () => {}
      })
    )

    expect(markup).toContain('agents')
    expect(markup).not.toContain('T1-클로드')
  })
})
