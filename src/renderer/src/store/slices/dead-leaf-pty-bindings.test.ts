// A follow switch leaves a short tab's leaves bound to sessions the sleep
// killed. After a swap-back those ids embed the CURRENT worktree, so the
// ownership check passes and the remount reattaches to a dead session instead
// of spawning — the 3-pane split stuck at one live pane.
import { afterEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'

const WORKTREE = 'repo::/promoted'
const TAB = 'tab-split'
const LEAF_LIVE = '11111111-1111-4111-8111-111111111111'
const LEAF_DEAD_A = '22222222-2222-4222-8222-222222222222'
const LEAF_DEAD_B = '33333333-3333-4333-8333-333333333333'
const LIVE_PTY = `${WORKTREE}@@live`

const initialState = useAppStore.getState()
afterEach(() => {
  useAppStore.setState(initialState, true)
})

function seed(tabPtyId: string | null): void {
  useAppStore.setState({
    tabsByWorktree: {
      [WORKTREE]: [
        {
          id: TAB,
          ptyId: tabPtyId,
          worktreeId: WORKTREE,
          title: 'MIX',
          customTitle: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        }
      ]
    },
    terminalLayoutsByTabId: {
      [TAB]: {
        root: {
          type: 'split',
          direction: 'vertical',
          first: { type: 'leaf', leafId: LEAF_LIVE },
          second: {
            type: 'split',
            direction: 'horizontal',
            first: { type: 'leaf', leafId: LEAF_DEAD_A },
            second: { type: 'leaf', leafId: LEAF_DEAD_B }
          }
        },
        activeLeafId: LEAF_LIVE,
        expandedLeafId: null,
        ptyIdsByLeafId: {
          [LEAF_LIVE]: LIVE_PTY,
          [LEAF_DEAD_A]: `${WORKTREE}@@deadA`,
          [LEAF_DEAD_B]: `${WORKTREE}@@deadB`
        }
      }
    },
    ptyIdsByTabId: { [TAB]: [LIVE_PTY] }
  } as never)
}

describe('clearDeadLeafPtyBindings', () => {
  it('drops bindings whose session is not live and keeps the live one', () => {
    seed(LIVE_PTY)

    const cleared = useAppStore.getState().clearDeadLeafPtyBindings([TAB])

    expect(cleared).toBe(2)
    expect(useAppStore.getState().terminalLayoutsByTabId[TAB]?.ptyIdsByLeafId).toEqual({
      [LEAF_LIVE]: LIVE_PTY
    })
    // The split tree itself is untouched — the panes stay, they just respawn.
    expect(useAppStore.getState().terminalLayoutsByTabId[TAB]?.root).toMatchObject({
      type: 'split',
      second: { type: 'split' }
    })
    // The tab-level id is still live, so it stays.
    expect(useAppStore.getState().tabsByWorktree[WORKTREE]?.[0]?.ptyId).toBe(LIVE_PTY)
  })

  it('clears a tab-level id that names a dead session', () => {
    seed(`${WORKTREE}@@deadA`)

    useAppStore.getState().clearDeadLeafPtyBindings([TAB])

    expect(useAppStore.getState().tabsByWorktree[WORKTREE]?.[0]?.ptyId).toBeNull()
  })

  it('is a no-op when every binding is live', () => {
    seed(LIVE_PTY)
    useAppStore.setState({
      terminalLayoutsByTabId: {
        [TAB]: {
          ...useAppStore.getState().terminalLayoutsByTabId[TAB],
          ptyIdsByLeafId: { [LEAF_LIVE]: LIVE_PTY }
        }
      }
    } as never)

    expect(useAppStore.getState().clearDeadLeafPtyBindings([TAB])).toBe(0)
  })
})
