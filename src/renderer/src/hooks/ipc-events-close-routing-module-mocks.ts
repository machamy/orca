/* oxlint-disable anti-slop/no-module-mocking -- Vitest support module for the close-routing
   ipc-events specs, not shipped code, and it falls outside the *.test / *.spec / tests glob set.
   Fork: split out of ipc-events-close-routing-test-harness to keep that file under its line cap. */
import type * as ReactModule from 'react'
import { vi } from 'vitest'

/**
 * The module graph the close-routing suites stub before `useIpcEvents` loads:
 * a synchronous `useEffect`, the app store, and the side-effecting singletons
 * the hook reaches for while registering listeners.
 */
export function mockCloseRoutingModules({
  getState,
  persistWorkspaceSession
}: {
  getState: () => Record<string, unknown>
  persistWorkspaceSession: ReturnType<typeof vi.fn>
}): void {
  if (typeof HTMLElement === 'undefined') {
    vi.stubGlobal('HTMLElement', class {})
  }
  vi.doMock('react', async () => {
    const actual = await vi.importActual<typeof ReactModule>('react')
    return {
      ...actual,
      useEffect: (effect: () => void | (() => void)) => {
        effect()
      }
    }
  })

  const appStoreModule = {
    useAppStore: {
      subscribe: vi.fn(() => () => {}),
      getState: () => ({
        getActiveTab: () => null,
        closeUnifiedTab: vi.fn(),
        reconcileWorktreeTabModel: () => ({ renderableTabCount: 1 }),
        setUpdateStatus: vi.fn(),
        fetchRepos: vi.fn(),
        fetchWorktrees: vi.fn(),
        setActiveView: vi.fn(),
        activeModal: null,
        closeModal: vi.fn(),
        openModal: vi.fn(),
        activeWorktreeId: 'wt-1',
        activeView: 'terminal',
        setActiveRepo: vi.fn(),
        setActiveWorktree: vi.fn(),
        revealWorktreeInSidebar: vi.fn(),
        setIsFullScreen: vi.fn(),
        updateBrowserTabPageState: vi.fn(),
        activeTabType: 'browser',
        editorFontZoomLevel: 0,
        setEditorFontZoomLevel: vi.fn(),
        setRateLimitsFromPush: vi.fn(),
        setSshConnectionState: vi.fn(),
        setSshTargetLabels: vi.fn(),
        setPortForwards: vi.fn(),
        clearPortForwards: vi.fn(),
        setDetectedPorts: vi.fn(),
        enqueueSshCredentialRequest: vi.fn(),
        removeSshCredentialRequest: vi.fn(),
        settings: { activeRuntimeEnvironmentId: null, terminalFontSize: 13 },
        activeBrowserTabId: 'workspace-1',
        activeBrowserTabIdByWorktree: { 'wt-1': 'workspace-1' },
        browserTabsByWorktree: { 'wt-1': [{ id: 'workspace-1' }] },
        browserPagesByWorkspace: {},
        openFiles: [],
        unifiedTabsByWorktree: {},
        closeBrowserTab: vi.fn(),
        closeBrowserPage: vi.fn(),
        requestPinnedTabCloseConfirm: vi.fn(),
        ...getState()
      })
    }
  }

  vi.doMock('../store', () => appStoreModule)
  vi.doMock('@/store', () => appStoreModule)

  vi.doMock('@/lib/ui-zoom', () => ({
    applyUIZoom: vi.fn()
  }))
  vi.doMock('@/lib/worktree-activation', () => ({
    activateAndRevealWorktree: vi.fn(),
    ensureWorktreeHasInitialTerminal: vi.fn()
  }))
  vi.doMock('@/components/sidebar/visible-worktrees', () => ({
    getVisibleWorktreeIds: () => []
  }))
  vi.doMock('@/lib/editor-font-zoom', () => ({
    nextEditorFontZoomLevel: vi.fn(() => 0),
    computeEditorFontSize: vi.fn(() => 13)
  }))
  vi.doMock('@/components/settings/SettingsConstants', () => ({
    zoomLevelToPercent: vi.fn(() => 100),
    ZOOM_MIN: -3,
    ZOOM_MAX: 3
  }))
  vi.doMock('@/lib/zoom-events', () => ({
    dispatchZoomLevelChanged: vi.fn()
  }))
  vi.doMock('@/lib/workspace-session-host-persistence', () => ({
    persistWorkspaceSessionByHost: persistWorkspaceSession
  }))
  vi.doMock('@/lib/workspace-session', () => ({
    buildWorkspaceSessionPayload: vi.fn(() => ({}))
  }))
}
