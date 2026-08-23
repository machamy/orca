import { describe, expect, it, vi } from 'vitest'
import type { AgentProviderSessionMetadata } from '../../../../shared/agent-session-resume'
import { applyResumedAgentBookkeeping } from './cold-restore-resume-bookkeeping'

const SESSION: AgentProviderSessionMetadata = {
  key: 'session_id',
  id: 'sess-1',
  transcriptPath: '/t/one.jsonl'
}

const ARGS = {
  cacheKey: 'pane-key',
  tabId: 'tab-1',
  worktreeId: 'r1::/wt',
  agent: 'claude' as const,
  providerSession: SESSION,
  launchToken: 'launch-1'
}

function makeStore(existingStatus = false) {
  const calls: string[] = []
  return {
    calls,
    store: {
      recordAgentProviderSession: vi.fn(() => {
        calls.push('record')
      }),
      agentStatusByPaneKey: existingStatus ? { 'pane-key': { state: 'working' } } : {},
      setAgentStatus: vi.fn(() => {
        calls.push('seed')
      })
    }
  }
}

describe('applyResumedAgentBookkeeping', () => {
  it('records the identity first, then seeds the status row, with exact payloads', () => {
    const { store, calls } = makeStore()
    applyResumedAgentBookkeeping(store as never, ARGS)

    expect(calls).toEqual(['record', 'seed'])
    expect(store.recordAgentProviderSession).toHaveBeenCalledWith(
      'pane-key',
      'claude',
      SESSION,
      undefined,
      { tabId: 'tab-1', worktreeId: 'r1::/wt' },
      { launchToken: 'launch-1' }
    )
    expect(store.setAgentStatus).toHaveBeenCalledWith(
      'pane-key',
      { state: 'done', prompt: '', agentType: 'claude', restoredUnconfirmed: true },
      undefined,
      undefined,
      { tabId: 'tab-1', worktreeId: 'r1::/wt' },
      { providerSession: SESSION, launchToken: 'launch-1' }
    )
  })

  it('never overwrites an existing status row', () => {
    const { store } = makeStore(true)
    applyResumedAgentBookkeeping(store as never, ARGS)

    expect(store.recordAgentProviderSession).toHaveBeenCalledTimes(1)
    expect(store.setAgentStatus).not.toHaveBeenCalled()
  })
})
