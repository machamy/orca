import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session-resume'
import {
  AGENT_STATUS_STALE_AFTER_MS,
  type AgentStatusEntry
} from '../../../../shared/agent-status-types'
import type { AppState } from '../types'
import { createTestStore, makeTab } from './store-test-helpers'

const NOW = 1_800_000_000_000

afterEach(() => {
  vi.useRealTimers()
})

function makeAgentEntry(overrides: Partial<AgentStatusEntry> = {}): AgentStatusEntry {
  const paneKey = overrides.paneKey ?? 'tab-1:leaf-1'
  return {
    state: 'working',
    prompt: 'finish the task',
    updatedAt: NOW,
    stateStartedAt: NOW,
    stateHistory: [],
    agentType: 'codex',
    paneKey,
    tabId: paneKey.split(':')[0],
    worktreeId: 'wt-1',
    providerSession: { key: 'session_id', id: `session-${paneKey}` },
    ...overrides
  }
}

function seedTabs(store: ReturnType<typeof createTestStore>): void {
  store.setState({
    tabsByWorktree: {
      'wt-1': [makeTab({ id: 'tab-1', worktreeId: 'wt-1' })]
    }
  } as Partial<AppState>)
}

function makeSleepingRecord(
  overrides: Partial<SleepingAgentSessionRecord> = {}
): SleepingAgentSessionRecord {
  const paneKey = overrides.paneKey ?? 'tab-1:leaf-1'
  return {
    paneKey,
    tabId: paneKey.split(':')[0],
    worktreeId: 'wt-1',
    agent: 'codex',
    providerSession: { key: 'session_id', id: `sleeping-${paneKey}` },
    prompt: 'old prompt',
    state: 'working',
    capturedAt: NOW - AGENT_STATUS_STALE_AFTER_MS - 1,
    updatedAt: NOW - AGENT_STATUS_STALE_AFTER_MS - 1,
    origin: 'live',
    ...overrides
  }
}

describe('manual sleep agent session capture', () => {
  it('captures every resumable live row as a worktree-sleep record keeping its own state', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const store = createTestStore()
    seedTabs(store)
    store.setState({
      agentStatusByPaneKey: {
        'tab-1:fresh': makeAgentEntry({ paneKey: 'tab-1:fresh' }),
        'tab-1:stale': makeAgentEntry({
          paneKey: 'tab-1:stale',
          updatedAt: NOW - AGENT_STATUS_STALE_AFTER_MS - 1
        }),
        'tab-1:done': makeAgentEntry({ paneKey: 'tab-1:done', state: 'done' }),
        'tab-1:interrupted': makeAgentEntry({
          paneKey: 'tab-1:interrupted',
          state: 'done',
          interrupted: true
        }),
        'tab-1:post-input': makeAgentEntry({
          paneKey: 'tab-1:post-input',
          updatedAt: NOW - 1_000
        })
      },
      lastTerminalInputAtByPaneKey: { 'tab-1:post-input': NOW }
    } as Partial<AppState>)

    store.getState().captureSleepingAgentSessionsByWorktree('wt-1')

    const records = store.getState().sleepingAgentSessionsByPaneKey
    expect(Object.keys(records).sort()).toEqual([
      'tab-1:done',
      'tab-1:fresh',
      'tab-1:interrupted',
      'tab-1:post-input',
      'tab-1:stale'
    ])
    expect(records['tab-1:fresh']).toMatchObject({
      origin: 'worktree-sleep',
      state: 'working',
      providerSession: { key: 'session_id', id: 'session-tab-1:fresh' }
    })
    expect(records['tab-1:done']).toMatchObject({ origin: 'worktree-sleep', state: 'done' })
    expect(records['tab-1:done'].interrupted).toBeUndefined()
    expect(records['tab-1:interrupted']).toMatchObject({
      origin: 'worktree-sleep',
      state: 'done'
    })
    expect(records['tab-1:interrupted'].interrupted).toBeUndefined()
    expect(records['tab-1:post-input']).toMatchObject({ state: 'working', updatedAt: NOW })
    expect(records['tab-1:stale']).toMatchObject({ state: 'working', updatedAt: NOW })
  })

  it('carries a blocked legacy-orchestration-worker flag onto the replacement record', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const store = createTestStore()
    seedTabs(store)
    store.setState({
      agentStatusByPaneKey: {
        'tab-1:leaf-1': makeAgentEntry(),
        'tab-1:leaf-2': makeAgentEntry({ paneKey: 'tab-1:leaf-2' })
      },
      sleepingAgentSessionsByPaneKey: {
        'tab-1:leaf-1': makeSleepingRecord({
          providerSession: { key: 'session_id', id: 'session-tab-1:leaf-1' },
          automaticResumeBlockedBy: 'legacy-orchestration-worker'
        }),
        'tab-1:leaf-2': makeSleepingRecord({
          paneKey: 'tab-1:leaf-2',
          automaticResumeBlockedBy: 'legacy-orchestration-worker'
        })
      }
    } as Partial<AppState>)

    store.getState().captureSleepingAgentSessionsByWorktree('wt-1')

    const records = store.getState().sleepingAgentSessionsByPaneKey
    expect(records['tab-1:leaf-1'].automaticResumeBlockedBy).toBe('legacy-orchestration-worker')
    // Different provider session: the block belonged to a session that is no longer running here.
    expect(records['tab-1:leaf-2'].automaticResumeBlockedBy).toBeUndefined()
  })

  it('preserves retained completed sessions as intentional sleep records', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const store = createTestStore()
    seedTabs(store)
    const entry = makeAgentEntry({ paneKey: 'tab-1:done', state: 'done' })
    const tab = makeTab({ id: 'tab-1', worktreeId: 'wt-1' })
    store.setState({
      retainedAgentsByPaneKey: {
        'tab-1:done': {
          entry,
          tab,
          worktreeId: 'wt-1',
          agentType: 'codex',
          startedAt: entry.stateStartedAt
        }
      }
    } as Partial<AppState>)

    store.getState().captureSleepingAgentSessionsByWorktree('wt-1')

    expect(store.getState().sleepingAgentSessionsByPaneKey['tab-1:done']).toMatchObject({
      origin: 'worktree-sleep',
      state: 'done',
      providerSession: { key: 'session_id', id: 'session-tab-1:done' }
    })
  })

  it('replaces pre-existing records for stale rows instead of dropping them', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const store = createTestStore()
    seedTabs(store)
    store.setState({
      agentStatusByPaneKey: {
        'tab-1:stale': makeAgentEntry({
          paneKey: 'tab-1:stale',
          updatedAt: NOW - AGENT_STATUS_STALE_AFTER_MS - 1
        })
      },
      sleepingAgentSessionsByPaneKey: {
        'tab-1:stale': makeSleepingRecord({ paneKey: 'tab-1:stale' })
      }
    } as Partial<AppState>)

    store.getState().captureSleepingAgentSessionsByWorktree('wt-1')

    expect(store.getState().sleepingAgentSessionsByPaneKey['tab-1:stale']).toMatchObject({
      origin: 'worktree-sleep',
      updatedAt: NOW,
      providerSession: { key: 'session_id', id: 'session-tab-1:stale' }
    })
  })

  it('keeps the live checkpoint of an interrupted pane as a worktree-sleep record', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const store = createTestStore()
    seedTabs(store)
    store
      .getState()
      .setAgentStatus(
        'tab-1:leaf-1',
        { state: 'done', prompt: 'do the thing', agentType: 'claude', interrupted: true },
        'Claude',
        { updatedAt: NOW, stateStartedAt: NOW },
        { tabId: 'tab-1', worktreeId: 'wt-1' },
        { providerSession: { key: 'session_id', id: 'claude-session-1' } }
      )
    expect(store.getState().sleepingAgentSessionsByPaneKey['tab-1:leaf-1']).toMatchObject({
      origin: 'live'
    })

    store.getState().captureSleepingAgentSessionsByWorktree('wt-1')

    expect(store.getState().sleepingAgentSessionsByPaneKey['tab-1:leaf-1']).toMatchObject({
      origin: 'worktree-sleep',
      state: 'done',
      agent: 'claude',
      providerSession: { key: 'session_id', id: 'claude-session-1' }
    })
  })

  it('does not promote Pi identity without an authoritative transcript', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const store = createTestStore()
    seedTabs(store)
    store.setState({
      sleepingAgentSessionsByPaneKey: {
        'tab-1:leaf-1': makeSleepingRecord({
          agent: 'pi',
          providerSession: { key: 'session_id', id: 'pi-session-1' }
        })
      }
    } as Partial<AppState>)

    store.getState().captureSleepingAgentSessionsByWorktree('wt-1')

    expect(store.getState().sleepingAgentSessionsByPaneKey['tab-1:leaf-1']).toBeUndefined()
  })

  it('captures resumable rows when terminal shutdown captures sleeping records', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const store = createTestStore()
    seedTabs(store)
    store.setState({
      agentStatusByPaneKey: {
        'tab-1:fresh': makeAgentEntry({ paneKey: 'tab-1:fresh' }),
        'tab-1:done': makeAgentEntry({ paneKey: 'tab-1:done', state: 'done' })
      }
    } as Partial<AppState>)

    await store.getState().shutdownWorktreeTerminals('wt-1', { keepIdentifiers: true })

    const records = store.getState().sleepingAgentSessionsByPaneKey
    expect(Object.keys(records).sort()).toEqual(['tab-1:done', 'tab-1:fresh'])
    expect(records['tab-1:fresh']).toMatchObject({
      origin: 'worktree-sleep',
      state: 'working'
    })
    expect(records['tab-1:done']).toMatchObject({
      origin: 'worktree-sleep',
      state: 'done'
    })
  })

  // Why: runSleepWorktrees deactivates the workspace before terminal shutdown, so capture must
  // still see the live rows it is about to kill.
  it('captures done and interrupted rows after the slept worktree is deactivated', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const store = createTestStore()
    seedTabs(store)
    store.setState({
      activeWorktreeId: 'wt-1',
      agentStatusByPaneKey: {
        'tab-1:done': makeAgentEntry({ paneKey: 'tab-1:done', state: 'done' }),
        'tab-1:interrupted': makeAgentEntry({
          paneKey: 'tab-1:interrupted',
          state: 'done',
          interrupted: true
        })
      }
    } as Partial<AppState>)

    store.getState().setActiveWorktree(null)
    await store.getState().shutdownWorktreeTerminals('wt-1', { keepIdentifiers: true })

    const records = store.getState().sleepingAgentSessionsByPaneKey
    expect(Object.keys(records).sort()).toEqual(['tab-1:done', 'tab-1:interrupted'])
    expect(records['tab-1:interrupted']).toMatchObject({
      origin: 'worktree-sleep',
      state: 'done'
    })
  })

  it('replaces pre-existing records for stale rows during terminal shutdown capture', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const store = createTestStore()
    seedTabs(store)
    store.setState({
      ptyIdsByTabId: { 'tab-1': [] },
      agentStatusByPaneKey: {
        'tab-1:stale': makeAgentEntry({
          paneKey: 'tab-1:stale',
          updatedAt: NOW - AGENT_STATUS_STALE_AFTER_MS - 1
        })
      },
      sleepingAgentSessionsByPaneKey: {
        'tab-1:stale': makeSleepingRecord({ paneKey: 'tab-1:stale' })
      }
    } as Partial<AppState>)

    await store.getState().shutdownWorktreeTerminals('wt-1', { keepIdentifiers: true })

    expect(store.getState().sleepingAgentSessionsByPaneKey['tab-1:stale']).toMatchObject({
      origin: 'worktree-sleep',
      updatedAt: NOW,
      providerSession: { key: 'session_id', id: 'session-tab-1:stale' }
    })
  })
})
