import { describe, expect, it } from 'vitest'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import {
  selectSummaryFocusAgent,
  summaryFocusAgentLabel
} from './worktree-card-summary-focus-agent'

function makeAgent(
  overrides: {
    state?: string
    tabTitle?: string
    customTitle?: string | null
    updatedAt?: number
    interrupted?: boolean
  } = {}
): DashboardAgentRowData {
  const { state = 'idle', tabTitle = 'tab', customTitle = null, updatedAt = 0 } = overrides
  return {
    paneKey: `${tabTitle}:leaf`,
    agentType: 'claude',
    state,
    tab: { id: tabTitle, title: tabTitle, customTitle },
    entry: {
      updatedAt,
      stateStartedAt: updatedAt,
      ...(overrides.interrupted === true ? { interrupted: true } : {})
    }
  } as unknown as DashboardAgentRowData
}

describe('selectSummaryFocusAgent', () => {
  it('names a working agent over one that is merely done', () => {
    const working = makeAgent({ state: 'working', tabTitle: 'T1-클로드' })
    const agents = [makeAgent({ state: 'done', tabTitle: 'T2-셸' }), working]

    expect(selectSummaryFocusAgent(agents)).toBe(working)
  })

  it('prefers an agent waiting on the user over an idle one', () => {
    const waiting = makeAgent({ state: 'waiting', tabTitle: 'needs-input' })
    const agents = [makeAgent({ state: 'idle', tabTitle: 'quiet' }), waiting]

    expect(selectSummaryFocusAgent(agents)).toBe(waiting)
  })

  it('breaks a same-state tie with the most recent activity', () => {
    const older = makeAgent({ state: 'working', tabTitle: 'older', updatedAt: 10 })
    const newer = makeAgent({ state: 'working', tabTitle: 'newer', updatedAt: 20 })

    expect(selectSummaryFocusAgent([older, newer])).toBe(newer)
    expect(selectSummaryFocusAgent([newer, older])).toBe(newer)
  })

  it('has nothing to name when there are no agents', () => {
    expect(selectSummaryFocusAgent([])).toBeNull()
  })
})

describe('summaryFocusAgentLabel', () => {
  it('uses the name the tab bar shows, preferring a user-set title', () => {
    expect(summaryFocusAgentLabel(makeAgent({ tabTitle: 'auto', customTitle: '내 탭' }))).toBe(
      '내 탭'
    )
    expect(summaryFocusAgentLabel(makeAgent({ tabTitle: 'auto' }))).toBe('auto')
  })
})
