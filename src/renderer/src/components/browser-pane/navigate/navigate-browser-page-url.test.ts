import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navigateBrowserPageToUrl } from './navigate-browser-page-url'
import type { MutableRefObject } from 'react'

const statRuntimePath = vi.fn(async () => ({ isDirectory: false }))
const isRemoteRuntimeFileOperation = vi.fn(() => false)
const openFile = vi.fn()
const setActiveTabType = vi.fn()
const authorizeExternalPath = vi.fn(async () => undefined)

let repos: { id: string; path: string; connectionId?: string }[] = []

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
      allWorktrees: () => [{ id: 'wt-1', path: '/repo' }],
      ensureWorktreeRootGroup: () => 'group-1',
      // Page fixture: the handoff bails when the navigating page is gone from the store.
      browserPagesByWorkspace: { 'workspace-1': [{ id: 'tab-1', url: '' }] },
      // Owner-resolution slices: the handoff gate resolves the FILE's owner from these.
      repos,
      worktreesByRepo: {},
      folderWorkspaces: [],
      projectGroups: [],
      setActiveTabType,
      openFile,
      setBrowserPageUrl: vi.fn(),
      updateBrowserPageState: vi.fn()
    })
  }
}))

function ref<T>(value: T): MutableRefObject<T> {
  return { current: value }
}

function navigate(url: string): { webview: { src: string } } {
  const webview = { src: '' }
  navigateBrowserPageToUrl({
    url,
    browserTabId: 'tab-1',
    worktreeId: 'wt-1',
    activeLoadFailureRef: ref(null),
    lastKnownWebviewUrlRef: ref<string | null>(null),
    trackNextLoadingEventRef: ref(false),
    recoveryNavigationValidationRef: ref(null),
    webviewRef: ref(webview as unknown as Electron.WebviewTag),
    onSetUrlRef: ref(vi.fn()),
    onUpdatePageStateRef: ref(vi.fn()),
    setAddressBarValue: vi.fn(),
    setResourceNotice: vi.fn(),
    focusWebviewNow: () => true
  })
  return { webview }
}

describe('navigateBrowserPageToUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repos = [{ id: 'wt-1', path: '/repo' }]
    statRuntimePath.mockResolvedValue({ isDirectory: false })
    isRemoteRuntimeFileOperation.mockReturnValue(false)
    Object.assign(globalThis, {
      window: { api: { fs: { authorizeExternalPath } } }
    })
  })

  it('opens a file:// markdown document in the editor instead of the browser', async () => {
    const { webview } = navigate('file:///repo/docs/guide.md')

    await vi.waitFor(() => expect(openFile).toHaveBeenCalled())
    expect(setActiveTabType).toHaveBeenCalledWith('editor')
    expect(authorizeExternalPath).toHaveBeenCalledWith({ targetPath: '/repo/docs/guide.md' })
    expect(openFile).toHaveBeenCalledWith(
      {
        filePath: '/repo/docs/guide.md',
        relativePath: 'docs/guide.md',
        worktreeId: 'wt-1',
        // Why: 'markdown' + 'edit' is what makes the editor default to the rich view.
        language: 'markdown',
        mode: 'edit',
        // Explicit null: the probe verified the CLIENT-LOCAL owner.
        runtimeEnvironmentId: null
      },
      { preview: false, targetGroupId: 'group-1' }
    )
    expect(webview.src).toBe('')
  })

  it('still opens file:// notebooks in the editor', async () => {
    navigate('file:///repo/analysis.ipynb')

    await vi.waitFor(() => expect(openFile).toHaveBeenCalled())
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/repo/analysis.ipynb', language: 'notebook' }),
      expect.anything()
    )
  })

  it('leaves markdown to the browser on a connection-backed worktree', async () => {
    repos = [{ id: 'wt-1', path: '/repo', connectionId: 'conn-1' }]
    const { webview } = navigate('file:///repo/docs/guide.md')

    await vi.waitFor(() => expect(webview.src).toBe('file:///repo/docs/guide.md'))
    expect(openFile).not.toHaveBeenCalled()
  })

  it('does not intercept http(s) URLs', () => {
    const { webview } = navigate('https://example.com/README.md')

    expect(webview.src).toBe('https://example.com/README.md')
    expect(openFile).not.toHaveBeenCalled()
  })

  it('does not intercept non-markdown file:// documents', () => {
    const { webview } = navigate('file:///repo/notes.txt')

    expect(webview.src).toBe('file:///repo/notes.txt')
    expect(openFile).not.toHaveBeenCalled()
  })

  it('falls back to the browser when the markdown path is a directory', async () => {
    statRuntimePath.mockResolvedValue({ isDirectory: true })
    const { webview } = navigate('file:///repo/weird.md')

    await vi.waitFor(() => expect(webview.src).toBe('file:///repo/weird.md'))
    expect(openFile).not.toHaveBeenCalled()
  })
})
