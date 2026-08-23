import { describe, expect, it, vi } from 'vitest'
import {
  buildDefaultSwitchNotice,
  collectDefaultSwitchNoticeTargets,
  deliverDefaultSwitchNotice
} from './default-worktree-switch-agent-notice'

const LEAF = '11111111-1111-4111-8111-111111111111'

const SIDE = { path: '/repo', branch: 'feature/a' }

function state(agentState: string) {
  return {
    tabsByWorktree: { 'repo::/wt': [{ id: 'tab-1' } as never] },
    terminalLayoutsByTabId: { 'tab-1': { ptyIdsByLeafId: { [LEAF]: 'pty-1' } } as never },
    ptyIdsByTabId: { 'tab-1': ['pty-1'] },
    agentStatusByPaneKey: { [`tab-1:${LEAF}`]: { state: agentState } as never }
  }
}

describe('default switch agent notice', () => {
  it('names where this agent landed so it can re-check', () => {
    const notice = buildDefaultSwitchNotice(SIDE)

    expect(notice).toContain('/repo')
    expect(notice).toContain('feature/a')
    // Only this side: the other worktree's path would be spent from this
    // agent's context for nothing.
    expect(notice).not.toContain('/wt/b')
  })

  it('says the work itself travelled, so the agent does not assume it lost it', () => {
    // The branch carries its uncommitted changes, so an agent that only heard
    // "the path changed" could reasonably think its edits were left behind.
    const notice = buildDefaultSwitchNotice(SIDE)

    expect(notice).toMatch(/same/i)
  })

  it('reaches an agent that is waiting for input', () => {
    expect(collectDefaultSwitchNoticeTargets(state('waiting'), ['repo::/wt'])).toHaveLength(1)
  })

  it('leaves an agent mid-turn alone', () => {
    // Typing into a running turn would land inside what the agent is composing.
    expect(collectDefaultSwitchNoticeTargets(state('working'), ['repo::/wt'])).toHaveLength(0)
  })

  it('skips a pane whose pty is not live', () => {
    const dead = { ...state('done'), ptyIdsByTabId: { 'tab-1': [] } }

    expect(collectDefaultSwitchNoticeTargets(dead, ['repo::/wt'])).toHaveLength(0)
  })

  it('writes the note once per pane despite retrying while agents come back', () => {
    const write = vi.fn()
    const runs: (() => void)[] = []

    deliverDefaultSwitchNotice({
      worktreeIds: ['repo::/wt'],
      noticeFor: () => 'moved',
      getState: () => state('done'),
      write,
      schedule: (run) => runs.push(run),
      attemptDelaysMs: [1, 2, 3]
    })
    runs.forEach((run) => run())

    expect(write).toHaveBeenCalledExactlyOnceWith('pty-1', 'moved\r')
  })
})
