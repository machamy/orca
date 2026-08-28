// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadBrowserGuestUrl } from './load-browser-guest-url'
import { createBrowserPageWebviewNavigationHandlers } from '../host-guest/browser-page-webview-navigation-handlers'
import type { BrowserPage as BrowserPageState } from '../../../../../shared/browser-workspace-types'

const statRuntimePath = vi.fn(async () => ({ isDirectory: false }))
const isRemoteRuntimeFileOperation = vi.fn(() => false)
const openFile = vi.fn()
const setActiveTabType = vi.fn()
const setBrowserPageUrl = vi.fn()
const updateBrowserPageState = vi.fn()
const authorizeExternalPath = vi.fn(async () => undefined)

let browserPagesByWorkspace: Record<string, BrowserPageState[]> = {}

vi.mock('@/runtime/runtime-file-client', () => ({
  statRuntimePath: (...args: unknown[]) => statRuntimePath(...(args as [])),
  isRemoteRuntimeFileOperation: (...args: unknown[]) =>
    isRemoteRuntimeFileOperation(...(args as []))
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      settings: {},
      activeWorktreeId: 'wt-1',
      allWorktrees: () => [{ id: 'wt-1', path: '/workspace/sample-project' }],
      ensureWorktreeRootGroup: () => 'group-1',
      browserPagesByWorkspace,
      repos: [{ id: 'wt-1', path: '/workspace/sample-project' }],
      worktreesByRepo: {},
      folderWorkspaces: [],
      projectGroups: [],
      setActiveTabType,
      openFile,
      setBrowserPageUrl,
      updateBrowserPageState
    })
  }
}))

function ref<T>(current: T): { current: T } {
  return { current }
}

function createGuestNavigationHandlers(webviewUrl: () => string) {
  const webview = {
    getURL: webviewUrl,
    getTitle: () => 'Guest page',
    canGoBack: () => false,
    canGoForward: () => false,
    src: ''
  } as unknown as Electron.WebviewTag
  return createBrowserPageWebviewNavigationHandlers({
    webview,
    browserTabId: 'page-1',
    browserTabUrl: 'https://example.com/app',
    recoveryNavigationValidationRef: ref(null),
    activeLoadFailureRef: ref(null),
    lastKnownWebviewUrlRef: ref<string | null>(null),
    addressBarInputRef: ref(null),
    onSetUrlRef: ref((_tabId: string, url: string) => {
      const page = browserPagesByWorkspace['workspace-1']?.[0]
      if (page) {
        page.url = url
      }
    }),
    onUpdatePageStateRef: ref(vi.fn()),
    addBrowserHistoryEntryRef: ref(vi.fn()),
    faviconUrlRef: ref<string | null>(null),
    setAddressBarValue: vi.fn(),
    annotationViewportBridgeTokenRef: ref('token'),
    setBrowserOverlayViewport: vi.fn()
  })
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('guest-originated navigation vs in-flight handoff probe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    statRuntimePath.mockResolvedValue({ isDirectory: false })
    isRemoteRuntimeFileOperation.mockReturnValue(false)
    browserPagesByWorkspace = {
      'workspace-1': [{ id: 'page-1', url: 'https://example.com/app' } as BrowserPageState]
    }
    Object.assign(window, { api: { fs: { authorizeExternalPath } } })
  })

  it('a guest link click while a probe is in flight cancels the late handoff', async () => {
    let releaseStat!: (value: { isDirectory: boolean }) => void
    statRuntimePath.mockImplementationOnce(
      () => new Promise<{ isDirectory: boolean }>((resolve) => (releaseStat = resolve))
    )
    const handlers = createGuestNavigationHandlers(() => 'https://example.com/clicked')
    const loaded: string[] = []

    loadBrowserGuestUrl({
      url: 'file:///workspace/sample-project/docs/guide.md',
      worktreeId: 'wt-1',
      browserPageId: 'page-1',
      loadInGuest: (target) => loaded.push(target)
    })
    await vi.waitFor(() => expect(releaseStat).toBeTypeOf('function'))

    // The user clicks a link in the still-visible old page: the guest navigates on its own.
    handlers.handleFullDidNavigate({ url: 'https://example.com/clicked', isMainFrame: true })

    releaseStat({ isDirectory: false })
    await settle()

    expect(openFile).not.toHaveBeenCalled()
    expect(setActiveTabType).not.toHaveBeenCalled()
    expect(loaded).toEqual([])
  })

  it('an in-page (pushState) navigation while a probe is in flight cancels the late handoff', async () => {
    // did-start-navigation skips isInPlace and did-navigate never fires for a
    // pushState, so without a fence here the late probe steals focus into the
    // editor over the user's new SPA context.
    let releaseStat!: (value: { isDirectory: boolean }) => void
    statRuntimePath.mockImplementationOnce(
      () => new Promise<{ isDirectory: boolean }>((resolve) => (releaseStat = resolve))
    )
    const handlers = createGuestNavigationHandlers(() => 'https://example.com/app/route')
    const loaded: string[] = []

    loadBrowserGuestUrl({
      url: 'file:///workspace/sample-project/docs/guide.md',
      worktreeId: 'wt-1',
      browserPageId: 'page-1',
      loadInGuest: (target) => loaded.push(target)
    })
    await vi.waitFor(() => expect(releaseStat).toBeTypeOf('function'))

    // The still-visible old page pushStates on its own — a guest-originated navigation.
    handlers.handleDidNavigateInPage({ url: 'https://example.com/app/route', isMainFrame: true })

    releaseStat({ isDirectory: false })
    await settle()

    expect(openFile).not.toHaveBeenCalled()
    expect(setActiveTabType).not.toHaveBeenCalled()
    expect(loaded).toEqual([])
  })

  it('a subframe in-page navigation does not cancel the probe', async () => {
    // An iframe's pushState is not the user leaving the page.
    let releaseStat!: (value: { isDirectory: boolean }) => void
    statRuntimePath.mockImplementationOnce(
      () => new Promise<{ isDirectory: boolean }>((resolve) => (releaseStat = resolve))
    )
    const handlers = createGuestNavigationHandlers(() => 'https://example.com/app')
    const loaded: string[] = []

    loadBrowserGuestUrl({
      url: 'file:///workspace/sample-project/docs/guide.md',
      worktreeId: 'wt-1',
      browserPageId: 'page-1',
      loadInGuest: (target) => loaded.push(target)
    })
    await vi.waitFor(() => expect(releaseStat).toBeTypeOf('function'))

    handlers.handleDidNavigateInPage({ url: 'https://ads.example.net/frame', isMainFrame: false })

    releaseStat({ isDirectory: false })
    await settle()

    expect(openFile).toHaveBeenCalled()
  })
})
