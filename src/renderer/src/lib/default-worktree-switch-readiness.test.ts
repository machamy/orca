import { describe, expect, it } from 'vitest'
import type { AppState } from '@/store/types'
import {
  findUnreadyAgentPanes,
  waitForDefaultSwitchReadiness
} from './default-worktree-switch-readiness'

const WORKTREE = 'repo::/promoted'
const AGENT_TAB = 'tab-agent'
const SHELL_TAB = 'tab-shell'
const PTY = `${WORKTREE}@@live`

function makeState(overrides: Partial<AppState>): AppState {
  return {
    tabsByWorktree: {},
    ptyIdsByTabId: {},
    agentStatusByPaneKey: {},
    sleepingAgentSessionsByPaneKey: {},
    ...overrides
  } as AppState
}

const agentTab = { id: AGENT_TAB, launchAgent: 'codex', title: 'CX1', customTitle: null }

describe('findUnreadyAgentPanes', () => {
  it('flags a live agent pane with no capturable session', () => {
    const state = makeState({
      tabsByWorktree: { [WORKTREE]: [agentTab] as never },
      ptyIdsByTabId: { [AGENT_TAB]: [PTY] }
    })

    expect(findUnreadyAgentPanes(state, [WORKTREE])).toEqual([
      { worktreeId: WORKTREE, tabId: AGENT_TAB, title: 'CX1' }
    ])
  })

  it('accepts a live status row carrying the provider session', () => {
    const state = makeState({
      tabsByWorktree: { [WORKTREE]: [agentTab] as never },
      ptyIdsByTabId: { [AGENT_TAB]: [PTY] },
      agentStatusByPaneKey: {
        'pane-1': { tabId: AGENT_TAB, providerSession: { key: 'session_id', id: 's1' } }
      } as never
    })

    expect(findUnreadyAgentPanes(state, [WORKTREE])).toEqual([])
  })

  it('FIX: accepts a cold-restored agent known only by its resume record', () => {
    // No hook yet — codex emits none until the next prompt — but the restore
    // recorded the session it resumed with, so the sleep can capture it.
    const state = makeState({
      tabsByWorktree: { [WORKTREE]: [agentTab] as never },
      ptyIdsByTabId: { [AGENT_TAB]: [PTY] },
      sleepingAgentSessionsByPaneKey: {
        'pane-1': { tabId: AGENT_TAB, providerSession: { key: 'session_id', id: 's1' } }
      } as never
    })

    expect(findUnreadyAgentPanes(state, [WORKTREE])).toEqual([])
  })

  it('ignores plain shells and agent tabs with no live process', () => {
    const state = makeState({
      tabsByWorktree: {
        [WORKTREE]: [{ id: SHELL_TAB, title: 'PLAIN', customTitle: null }, agentTab] as never
      },
      ptyIdsByTabId: { [SHELL_TAB]: [PTY] }
    })

    expect(findUnreadyAgentPanes(state, [WORKTREE])).toEqual([])
  })

  it('FIX: readiness proceeds (with the tabs named) instead of refusing forever', async () => {
    // A cold-restored agent can stay uncapturable indefinitely; refusing made
    // the switch impossible after an app restart.
    const { useAppStore } = await import('@/store')
    useAppStore.setState({
      defaultSwitchInFlight: null,
      tabsByWorktree: { [WORKTREE]: [agentTab] },
      ptyIdsByTabId: { [AGENT_TAB]: [PTY] },
      agentStatusByPaneKey: {},
      sleepingAgentSessionsByPaneKey: {}
    } as never)

    const result = await waitForDefaultSwitchReadiness([WORKTREE])

    expect(result.ready).toBe(true)
    expect(result.ready && result.unready?.map((pane) => pane.title)).toEqual(['CX1'])
  }, 60_000)
})
