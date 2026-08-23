import { describe, expect, it } from 'vitest'
import type {
  AgentProviderSessionMetadata,
  SleepingAgentSessionRecord
} from '../../../../shared/agent-session-resume'
import { shouldClearResumeClaimLoserRecord } from './cold-restore-resume-claim'

function record(
  agent: string,
  providerSession: AgentProviderSessionMetadata
): SleepingAgentSessionRecord {
  return {
    worktreeId: 'r1::/wt',
    tabId: 'tab-1',
    agent,
    providerSession,
    capturedAt: 0
  } as SleepingAgentSessionRecord
}

const SESSION: AgentProviderSessionMetadata = {
  key: 'session_id',
  id: 'sess-1',
  transcriptPath: '/t/one.jsonl'
}

describe('shouldClearResumeClaimLoserRecord', () => {
  it('clears the record when it names the exact session the winner took', () => {
    expect(
      shouldClearResumeClaimLoserRecord(
        { paneKey: 'pane-a', record: record('claude', SESSION) },
        { agent: 'claude', resumeProviderSession: SESSION }
      )
    ).toBe('pane-a')
  })

  it('keeps a record whose key does not match', () => {
    expect(
      shouldClearResumeClaimLoserRecord(
        { paneKey: 'pane-a', record: record('claude', { ...SESSION, key: 'conversation_id' }) },
        { agent: 'claude', resumeProviderSession: SESSION }
      )
    ).toBeNull()
  })

  it('ignores transcript-path drift for claude but not for pi', () => {
    const moved = { ...SESSION, transcriptPath: '/t/moved.jsonl' }
    // The default-worktree switch moves transcript trees between paths, so
    // claude equality deliberately excludes the path.
    expect(
      shouldClearResumeClaimLoserRecord(
        { paneKey: 'pane-a', record: record('claude', moved) },
        { agent: 'claude', resumeProviderSession: SESSION }
      )
    ).toBe('pane-a')
    expect(
      shouldClearResumeClaimLoserRecord(
        { paneKey: 'pane-a', record: record('pi', moved) },
        { agent: 'pi', resumeProviderSession: SESSION }
      )
    ).toBeNull()
  })

  it('keeps a record owned by a different agent', () => {
    expect(
      shouldClearResumeClaimLoserRecord(
        { paneKey: 'pane-a', record: record('codex', SESSION) },
        { agent: 'claude', resumeProviderSession: SESSION }
      )
    ).toBeNull()
  })

  it('does nothing without a resolved record', () => {
    expect(
      shouldClearResumeClaimLoserRecord(null, { agent: 'claude', resumeProviderSession: SESSION })
    ).toBeNull()
  })
})
