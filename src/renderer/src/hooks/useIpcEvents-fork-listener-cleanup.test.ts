import type * as ReactModule from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildStoreState, type StoreLike } from './ipc-events-agent-status-store-test-fixtures'
import {
  buildWindowApi,
  stubAuxiliaryModules
} from './ipc-events-agent-status-window-test-fixtures'

/**
 * Fork contract: the two fork UI listeners registered through
 * registerForkUiIpcListeners are torn down by useIpcEvents' own effect cleanup
 * — exactly once each. This pins the cleanup boundary the extraction promised
 * to keep: the unsubs ride in the same `unsubs` array as every other listener.
 */
describe('useIpcEvents fork listener cleanup', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('unmount tears each fork listener down exactly once', async () => {
    const cleanups: (() => void)[] = []
    vi.doMock('react', async () => {
      const actual = await vi.importActual<typeof ReactModule>('react')
      return {
        ...actual,
        useEffect: (effect: () => void | (() => void)) => {
          const cleanup = effect()
          if (typeof cleanup === 'function') {
            cleanups.push(cleanup)
          }
        }
      }
    })
    const storeState: StoreLike = buildStoreState({
      setAgentStatus: vi.fn(),
      updateTabTitle: vi.fn(),
      workspaceSessionReady: true,
      settings: { terminalFontSize: 13 }
    })
    vi.doMock('../store', () => ({
      useAppStore: {
        subscribe: vi.fn(() => () => {}),
        getState: () => storeState
      }
    }))
    stubAuxiliaryModules()

    const offerUnsub = vi.fn()
    const switchUnsub = vi.fn()
    const win = buildWindowApi({ onSet: () => () => {} }) as unknown as {
      api: { ui: Record<string, unknown> }
    }
    win.api.ui.onUnityAutoSeedOffer = () => offerUnsub
    win.api.ui.onDefaultWorktreeSwitchRequest = () => switchUnsub
    vi.stubGlobal('window', win)

    const { useIpcEvents } = await import('./useIpcEvents')
    useIpcEvents()
    await Promise.resolve()

    expect(offerUnsub).not.toHaveBeenCalled()
    expect(switchUnsub).not.toHaveBeenCalled()

    for (const cleanup of cleanups) {
      cleanup()
    }
    expect(offerUnsub).toHaveBeenCalledTimes(1)
    expect(switchUnsub).toHaveBeenCalledTimes(1)
  })
})
