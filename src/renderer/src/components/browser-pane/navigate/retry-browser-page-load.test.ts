import { beforeEach, describe, expect, it, vi } from 'vitest'
import { retryBrowserTabLoad } from './retry-browser-page-load'
import { ORCA_BROWSER_BLANK_URL } from '../../../../../shared/constants'
import type { BrowserPage as BrowserPageState } from '../../../../../shared/browser-workspace-types'

const statRuntimePath = vi.fn(async () => ({ isDirectory: false }))
const isRemoteRuntimeFileOperation = vi.fn(() => false)
const openFile = vi.fn()
const setBrowserPageUrl = vi.fn()
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
      // Owner-resolution slices: the handoff gate resolves the FILE's owner from these.
      repos: [{ id: 'wt-1', path: '/workspace/sample-project' }],
      worktreesByRepo: {},
      folderWorkspaces: [],
      projectGroups: [],
      setActiveTabType: vi.fn(),
      openFile,
      setBrowserPageUrl,
      updateBrowserPageState: vi.fn()
    })
  }
}))

describe('retryBrowserTabLoad', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    statRuntimePath.mockResolvedValue({ isDirectory: false })
    isRemoteRuntimeFileOperation.mockReturnValue(false)
    browserPagesByWorkspace = {}
    Object.assign(globalThis, {
      window: { api: { fs: { authorizeExternalPath } } }
    })
  })

  it('retries a failed load by assigning the attempted URL instead of reload()', () => {
    const webview = { src: 'chrome-error://chromewebdata/' }
    const onUpdatePageState = vi.fn()
    retryBrowserTabLoad(
      webview as Electron.WebviewTag,
      {
        id: 'page-1',
        worktreeId: 'wt-1',
        url: 'https://example.com/app',
        loadError: { code: -102, description: 'refused', validatedUrl: 'https://example.com/app' }
      } as BrowserPageState,
      onUpdatePageState
    )
    expect(onUpdatePageState).toHaveBeenCalledWith('page-1', {
      loading: true,
      title: 'https://example.com/app'
    })
    expect(webview.src).toBe('https://example.com/app')
  })

  it('does nothing when there is no webview', () => {
    const onUpdatePageState = vi.fn()
    retryBrowserTabLoad(
      null,
      { id: 'page-1', worktreeId: 'wt-1', url: 'https://example.com' } as BrowserPageState,
      onUpdatePageState
    )
    expect(onUpdatePageState).not.toHaveBeenCalled()
  })

  it('hands a retried markdown document to the editor and parks the page', async () => {
    const retriedPage = {
      id: 'page-1',
      worktreeId: 'wt-1',
      url: 'file:///workspace/sample-project/docs/guide.md'
    } as BrowserPageState
    browserPagesByWorkspace = { 'workspace-1': [retriedPage] }
    const webview = { src: 'chrome-error://chromewebdata/' }
    const onUpdatePageState = vi.fn()
    retryBrowserTabLoad(webview as Electron.WebviewTag, retriedPage, onUpdatePageState)

    await vi.waitFor(() => expect(openFile).toHaveBeenCalled())
    // The page is parked blank (store AND guest), never re-navigated to the document.
    expect(setBrowserPageUrl).toHaveBeenCalledWith('page-1', ORCA_BROWSER_BLANK_URL)
    expect(webview.src).toBe(ORCA_BROWSER_BLANK_URL)
  })
})
