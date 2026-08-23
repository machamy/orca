import { beforeEach, describe, expect, it } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import {
  clearDefaultSwitchWake,
  consumeDefaultSwitchWake,
  queueDefaultSwitchWake,
  remapWorktreeIdThroughMigrations
} from './default-worktree-switch-post-wake'

const SWAP = [
  { oldWorktreeId: 'repo::/feature', newWorktreeId: 'repo::/tmp-swap' },
  { oldWorktreeId: 'repo::/repo', newWorktreeId: 'repo::/feature' },
  { oldWorktreeId: 'repo::/tmp-swap', newWorktreeId: 'repo::/repo' }
]

function makeRecord(paneKey: string, worktreeId: string): SleepingAgentSessionRecord {
  return {
    paneKey,
    tabId: `tab-${paneKey}`,
    worktreeId,
    agent: 'claude',
    providerSession: { key: 'session_id', id: `sess-${paneKey}` },
    prompt: 'work',
    state: 'working',
    capturedAt: 1,
    updatedAt: 1,
    origin: 'worktree-sleep'
  } as SleepingAgentSessionRecord
}

describe('default switch post-wake queue', () => {
  beforeEach(() => {
    clearDefaultSwitchWake()
  })

  it('releases the queued pair and activate target once the migrations touch it, exactly once', () => {
    queueDefaultSwitchWake(['repo::/repo', 'repo::/feature'], 'repo::/repo', [], 1_000)

    const consumed = consumeDefaultSwitchWake(SWAP, 2_000)
    expect(consumed.worktreeIds.sort()).toEqual(['repo::/feature', 'repo::/repo'])
    expect(consumed.activateWorktreeId).toBe('repo::/repo')
    expect(consumeDefaultSwitchWake(SWAP, 2_000).worktreeIds).toEqual([])
  })

  it('ignores migrations for unrelated worktrees', () => {
    queueDefaultSwitchWake(['repo::/repo', 'repo::/feature'], 'repo::/repo', [], 1_000)

    expect(
      consumeDefaultSwitchWake([{ oldWorktreeId: 'repo::/x', newWorktreeId: 'repo::/y' }], 2_000)
        .worktreeIds
    ).toEqual([])
    expect(consumeDefaultSwitchWake(SWAP, 2_000).worktreeIds).toHaveLength(2)
  })

  it('expires a stale queue instead of waking on a much-later migration', () => {
    queueDefaultSwitchWake(['repo::/repo', 'repo::/feature'], 'repo::/repo', [], 1_000)

    expect(consumeDefaultSwitchWake(SWAP, 1_000 + 6 * 60_000).worktreeIds).toEqual([])
  })

  it('clear drops the queue', () => {
    queueDefaultSwitchWake(['repo::/repo'], 'repo::/repo', [], 1_000)
    clearDefaultSwitchWake()

    expect(consumeDefaultSwitchWake(SWAP, 2_000).worktreeIds).toEqual([])
  })

  it('re-keys snapshot records through the 3-step migrations on consume', () => {
    // Snapshot taken pre-swap: record A lives at the repo path, record B at the
    // selected worktree. After the swap each must land on the OTHER id.
    queueDefaultSwitchWake(
      ['repo::/repo', 'repo::/feature'],
      'repo::/repo',
      [makeRecord('pane-a', 'repo::/repo'), makeRecord('pane-b', 'repo::/feature')],
      1_000
    )

    const consumed = consumeDefaultSwitchWake(SWAP, 2_000)
    const byPane = Object.fromEntries(consumed.records.map((r) => [r.paneKey, r.worktreeId]))
    expect(byPane).toEqual({ 'pane-a': 'repo::/feature', 'pane-b': 'repo::/repo' })
  })

  it('remapWorktreeIdThroughMigrations applies the chain sequentially', () => {
    expect(remapWorktreeIdThroughMigrations('repo::/feature', SWAP)).toBe('repo::/repo')
    expect(remapWorktreeIdThroughMigrations('repo::/repo', SWAP)).toBe('repo::/feature')
    expect(remapWorktreeIdThroughMigrations('repo::/other', SWAP)).toBe('repo::/other')
  })
})
