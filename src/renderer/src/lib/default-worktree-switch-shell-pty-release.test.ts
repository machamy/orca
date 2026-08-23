import { describe, expect, it } from 'vitest'
import type { TerminalLayoutSnapshot } from '../../../shared/terminal-tab-types'
import { planFollowSwitchShellPtyRelease } from './default-worktree-switch-shell-pty-release'

const WORKTREE = 'repo::/work/promoted'
const AGENT_TAB = '11111111-1111-4111-8111-111111111111'
const SHELL_TAB = '22222222-2222-4222-8222-222222222222'
const SPLIT_TAB = '33333333-3333-4333-8333-333333333333'
const LEAF_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LEAF_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LEAF_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function layout(
  root: TerminalLayoutSnapshot['root'],
  ptyIdsByLeafId: Record<string, string>
): TerminalLayoutSnapshot {
  return { root, activeLeafId: null, expandedLeafId: null, ptyIdsByLeafId }
}

describe('planFollowSwitchShellPtyRelease', () => {
  it('releases a recordless shell tab but leaves the agent tab bound', () => {
    const plan = planFollowSwitchShellPtyRelease({
      worktreeIds: [WORKTREE],
      tabsByWorktree: {
        [WORKTREE]: [
          { id: AGENT_TAB, ptyId: 'old-worktree@@agent' },
          { id: SHELL_TAB, ptyId: 'old-worktree@@shell' }
        ]
      },
      terminalLayoutsByTabId: {
        [AGENT_TAB]: layout({ type: 'leaf', leafId: LEAF_A }, { [LEAF_A]: 'old-worktree@@agent' }),
        [SHELL_TAB]: layout({ type: 'leaf', leafId: LEAF_B }, { [LEAF_B]: 'old-worktree@@shell' })
      },
      sleepingAgentSessionsByPaneKey: { [`${AGENT_TAB}:${LEAF_A}`]: { paneKey: 'x' } }
    })

    expect(plan.tabIds).toEqual([SHELL_TAB])
    expect(plan.leafIdsByTabId).toEqual({ [SHELL_TAB]: [LEAF_B] })
  })

  it('releases every recordless pane of a split tab', () => {
    const plan = planFollowSwitchShellPtyRelease({
      worktreeIds: [WORKTREE],
      tabsByWorktree: { [WORKTREE]: [{ id: SPLIT_TAB, ptyId: 'old-worktree@@first' }] },
      terminalLayoutsByTabId: {
        [SPLIT_TAB]: layout(
          {
            type: 'split',
            direction: 'vertical',
            first: { type: 'leaf', leafId: LEAF_A },
            second: { type: 'leaf', leafId: LEAF_B }
          },
          { [LEAF_A]: 'old-worktree@@first', [LEAF_B]: 'old-worktree@@second' }
        )
      },
      sleepingAgentSessionsByPaneKey: {}
    })

    expect(plan.tabIds).toEqual([SPLIT_TAB])
    expect(plan.leafIdsByTabId[SPLIT_TAB]).toEqual([LEAF_A, LEAF_B])
  })

  it('keeps the tab-level id when its owning pane is the agent, releasing only the shell sibling', () => {
    const plan = planFollowSwitchShellPtyRelease({
      worktreeIds: [WORKTREE],
      tabsByWorktree: { [WORKTREE]: [{ id: SPLIT_TAB, ptyId: 'old-worktree@@agent' }] },
      terminalLayoutsByTabId: {
        [SPLIT_TAB]: layout(
          {
            type: 'split',
            direction: 'horizontal',
            first: { type: 'leaf', leafId: LEAF_A },
            second: { type: 'leaf', leafId: LEAF_C }
          },
          { [LEAF_A]: 'old-worktree@@agent', [LEAF_C]: 'old-worktree@@shell' }
        )
      },
      sleepingAgentSessionsByPaneKey: { [`${SPLIT_TAB}:${LEAF_A}`]: { paneKey: 'x' } }
    })

    expect(plan.tabIds).toEqual([])
    expect(plan.leafIdsByTabId[SPLIT_TAB]).toEqual([LEAF_C])
  })

  it('ignores worktrees outside the switch and tabs with no preserved bindings', () => {
    const plan = planFollowSwitchShellPtyRelease({
      worktreeIds: [WORKTREE],
      tabsByWorktree: {
        [WORKTREE]: [{ id: SHELL_TAB, ptyId: null }],
        'repo::/work/other': [{ id: AGENT_TAB, ptyId: 'old-worktree@@agent' }]
      },
      terminalLayoutsByTabId: {
        [SHELL_TAB]: layout({ type: 'leaf', leafId: LEAF_B }, {}),
        [AGENT_TAB]: layout({ type: 'leaf', leafId: LEAF_A }, { [LEAF_A]: 'old-worktree@@agent' })
      },
      sleepingAgentSessionsByPaneKey: {}
    })

    expect(plan.tabIds).toEqual([])
    expect(plan.leafIdsByTabId).toEqual({})
  })
})
