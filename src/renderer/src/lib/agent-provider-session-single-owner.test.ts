import { describe, expect, it } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import {
  collectProviderSessionDuplicatePaneKeys,
  filterReseedableSleepingRecords,
  releaseAgentSessionResume,
  tryClaimAgentSessionResume
} from './agent-provider-session-single-owner'

function record(
  paneKey: string,
  worktreeId: string,
  sessionId: string,
  agent = 'claude'
): SleepingAgentSessionRecord {
  return {
    paneKey,
    worktreeId,
    agent: agent as SleepingAgentSessionRecord['agent'],
    providerSession: { key: 'session_id' as const, id: sessionId },
    prompt: '',
    state: 'done',
    capturedAt: 1,
    updatedAt: 1
  }
}

describe('collectProviderSessionDuplicatePaneKeys', () => {
  const consumed = { paneKey: 'P1', record: record('P1', 'repo::/wt/a', 'S') }

  it('clears a same-session record in ANOTHER worktree of the same repo', () => {
    // The observed defect: the switch moved the session, and the same
    // conversation ended up recorded under both worktrees.
    const records = { P1: consumed.record, P2: record('P2', 'repo::/wt/b', 'S') }

    expect(collectProviderSessionDuplicatePaneKeys(records, consumed)).toEqual(['P2'])
  })

  it('never touches another repo, even on an identical session key', () => {
    const records = { P1: consumed.record, P2: record('P2', 'other::/wt', 'S') }

    expect(collectProviderSessionDuplicatePaneKeys(records, consumed)).toEqual([])
  })

  it('leaves different sessions and different agents alone', () => {
    const records = {
      P1: consumed.record,
      P2: record('P2', 'repo::/wt/b', 'OTHER'),
      P3: record('P3', 'repo::/wt/b', 'S', 'codex')
    }

    expect(collectProviderSessionDuplicatePaneKeys(records, consumed)).toEqual([])
  })
})

describe('filterReseedableSleepingRecords', () => {
  it('reseeds a record the churn really deleted', () => {
    expect(filterReseedableSleepingRecords([record('P1', 'repo::/a', 'S')], {}, [])).toHaveLength(1)
  })

  it('does not resurrect a session consumed under another paneKey', () => {
    // The fork re-recorded the session at P2; reviving P1 minted the duplicate.
    const existing = { P2: record('P2', 'repo::/b', 'S') }

    expect(
      filterReseedableSleepingRecords([record('P1', 'repo::/a', 'S')], existing, [])
    ).toHaveLength(0)
  })

  it('treats a live pane running the session as ownership', () => {
    expect(
      filterReseedableSleepingRecords([record('P1', 'repo::/a', 'S')], {}, [
        {
          worktreeId: 'repo::/b',
          agent: 'claude',
          providerSession: { key: 'session_id' as const, id: 'S' },
          state: 'working'
        }
      ])
    ).toHaveLength(0)
  })
})

const SESSION_C1 = { key: 'session_id' as const, id: 'C1' }
const SESSION_C2 = { key: 'session_id' as const, id: 'C2' }

describe('resume claims', () => {
  it('lets exactly one pane resume a session inside one burst', () => {
    releaseAgentSessionResume('claude', SESSION_C1)

    expect(tryClaimAgentSessionResume('claude', SESSION_C1, 1_000)).toBe(true)
    expect(tryClaimAgentSessionResume('claude', SESSION_C1, 1_500)).toBe(false)

    releaseAgentSessionResume('claude', SESSION_C1)
    expect(tryClaimAgentSessionResume('claude', SESSION_C1, 2_000)).toBe(true)
    releaseAgentSessionResume('claude', SESSION_C1)
  })

  it('lets a leaked claim expire instead of blocking the session forever', () => {
    releaseAgentSessionResume('claude', SESSION_C2)

    expect(tryClaimAgentSessionResume('claude', SESSION_C2, 0)).toBe(true)
    expect(tryClaimAgentSessionResume('claude', SESSION_C2, 120_001)).toBe(true)
    releaseAgentSessionResume('claude', SESSION_C2)
  })
})

describe('snapshot-internal duplicates', () => {
  it('reseeds one record per session even when the snapshot carries a pair', () => {
    // The snapshot can already hold the cross-worktree duplicate this module
    // exists to prevent; reseeding both would mint it right back.
    const pair = [record('P1', 'repo::/a', 'S'), record('P2', 'repo::/b', 'S')]

    expect(filterReseedableSleepingRecords(pair, {}, [])).toHaveLength(1)
  })
})

describe('snapshot duplicate ordering', () => {
  it('keeps the NEWEST record of a pair, not the first', () => {
    const stale = { ...record('P1', 'repo::/a', 'S'), updatedAt: 1_000 }
    const fresh = { ...record('P2', 'repo::/b', 'S'), updatedAt: 2_000 }

    const kept = filterReseedableSleepingRecords([stale, fresh], {}, [])

    expect(kept).toHaveLength(1)
    expect(kept[0]?.paneKey).toBe('P2')
  })
})
