import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { countActiveAgentsForDefaultSwitch } from './default-worktree-switch-live-agents'

const entry = (overrides: Partial<AgentStatusEntry>): AgentStatusEntry =>
  ({
    state: 'working',
    prompt: '',
    updatedAt: 1,
    stateStartedAt: 1,
    paneKey: 'tab-1:leaf-1',
    stateHistory: [],
    ...overrides
  }) as AgentStatusEntry

describe('countActiveAgentsForDefaultSwitch', () => {
  const worktreeIds = ['repo::/default', 'repo::/feature']

  it('counts working/blocked/waiting agents in either swapped worktree', () => {
    expect(
      countActiveAgentsForDefaultSwitch({
        agentStatusByPaneKey: {
          'tab-1:leaf-1': entry({ worktreeId: 'repo::/feature', state: 'working' }),
          'tab-2:leaf-1': entry({
            paneKey: 'tab-2:leaf-1',
            worktreeId: 'repo::/default',
            state: 'waiting'
          }),
          'tab-3:leaf-1': entry({
            paneKey: 'tab-3:leaf-1',
            worktreeId: 'repo::/other',
            state: 'working'
          }),
          'tab-4:leaf-1': entry({
            paneKey: 'tab-4:leaf-1',
            worktreeId: 'repo::/feature',
            state: 'done'
          })
        },
        worktreeIdByTabId: () => undefined,
        worktreeIds
      })
    ).toBe(2)
  })

  it('falls back to tab ownership when the entry lacks a worktree stamp', () => {
    expect(
      countActiveAgentsForDefaultSwitch({
        agentStatusByPaneKey: {
          'tab-9:leaf-1': entry({ paneKey: 'tab-9:leaf-1' })
        },
        worktreeIdByTabId: (tabId) => (tabId === 'tab-9' ? 'repo::/feature' : undefined),
        worktreeIds
      })
    ).toBe(1)
  })

  it('returns zero when nothing is live in the swapped pair', () => {
    expect(
      countActiveAgentsForDefaultSwitch({
        agentStatusByPaneKey: {
          'tab-1:leaf-1': entry({ worktreeId: 'repo::/other' })
        },
        worktreeIdByTabId: () => undefined,
        worktreeIds
      })
    ).toBe(0)
  })
})
