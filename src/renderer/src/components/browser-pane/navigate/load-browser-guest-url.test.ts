import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  browserGuestUrlProbeFenceCount,
  invalidateBrowserGuestUrlProbe,
  loadBrowserGuestUrl
} from './load-browser-guest-url'
import { ORCA_BROWSER_BLANK_URL } from '../../../../../shared/constants'
import type { BrowserPage as BrowserPageState } from '../../../../../shared/browser-workspace-types'
import type { FolderWorkspace } from '../../../../../shared/folder-workspace-types'
import type { Repo } from '../../../../../shared/repo-types'

const statRuntimePath = vi.fn(async () => ({ isDirectory: false }))
const isRemoteRuntimeFileOperation = vi.fn((..._args: unknown[]) => false)
const readRuntimeFilePreview = vi.fn(async () => ({ content: '# plain markdown', isBinary: false }))
const getMarkdownRichModeUnsupportedMessage = vi.fn((_content: string): string | null => null)
const openFile = vi.fn()
const openMarkdownPreview = vi.fn()
const setActiveTabType = vi.fn()
const setBrowserPageUrl = vi.fn()
const updateBrowserPageState = vi.fn()
const authorizeExternalPath = vi.fn(async () => undefined)

let browserPagesByWorkspace: Record<string, BrowserPageState[]> = {}
let repos: Repo[] = []
let folderWorkspaces: FolderWorkspace[] = []
let projectGroups: { id: string }[] = []
let settings: {
  activeRuntimeEnvironmentId?: string | null
  browserMarkdownEditorHandoff?: boolean
} = {}
let activeWorktreeId: string | null = 'wt-1'

vi.mock('@/runtime/runtime-file-client', () => ({
  statRuntimePath: (...args: unknown[]) => statRuntimePath(...(args as [])),
  isRemoteRuntimeFileOperation: (...args: unknown[]) =>
    isRemoteRuntimeFileOperation(...(args as [])),
  readRuntimeFilePreview: (...args: unknown[]) => readRuntimeFilePreview(...(args as []))
}))

// Why: the real detector drags TipTap's round-trip editor into a node-env test;
// its behavior is pinned by markdown-rich-mode.test.ts.
vi.mock('@/components/editor/markdown-rich-mode', () => ({
  getMarkdownRichModeUnsupportedMessage: (content: string) =>
    getMarkdownRichModeUnsupportedMessage(content)
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      settings,
      allWorktrees: () => [{ id: 'wt-1', path: '/workspace/sample-project' }],
      ensureWorktreeRootGroup: () => 'group-1',
      browserPagesByWorkspace,
      // Owner-resolution slices: the handoff gate resolves the FILE's owner from these.
      repos,
      worktreesByRepo: {},
      folderWorkspaces,
      projectGroups,
      activeWorktreeId,
      setActiveTabType,
      openFile,
      openMarkdownPreview,
      setBrowserPageUrl,
      updateBrowserPageState
    })
  }
}))

function page(url: string, id = 'page-1'): BrowserPageState {
  return { id, url } as BrowserPageState
}

function localRepoFixture(overrides: Partial<Repo> = {}): Repo {
  return { id: 'wt-1', path: '/workspace/sample-project', ...overrides } as Repo
}

function load(url: string, worktreeId = 'wt-1'): { loaded: string[] } {
  const loaded: string[] = []
  loadBrowserGuestUrl({
    url,
    worktreeId,
    browserPageId: 'page-1',
    loadInGuest: (target) => loaded.push(target)
  })
  return { loaded }
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('loadBrowserGuestUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    statRuntimePath.mockResolvedValue({ isDirectory: false })
    isRemoteRuntimeFileOperation.mockReturnValue(false)
    readRuntimeFilePreview.mockResolvedValue({ content: '# plain markdown', isBinary: false })
    getMarkdownRichModeUnsupportedMessage.mockReturnValue(null)
    // The page under test exists by default; individual tests override the URL or close it.
    browserPagesByWorkspace = { 'workspace-1': [page('https://example.com/elsewhere')] }
    repos = [localRepoFixture()]
    folderWorkspaces = []
    projectGroups = []
    settings = {}
    activeWorktreeId = 'wt-1'
    Object.assign(globalThis, {
      window: { api: { fs: { authorizeExternalPath } } }
    })
  })

  it('hands a markdown file:// document to the editor instead of the guest', async () => {
    const { loaded } = load('file:///workspace/sample-project/docs/guide.md')

    await vi.waitFor(() => expect(openFile).toHaveBeenCalled())
    expect(setActiveTabType).toHaveBeenCalledWith('editor')
    expect(authorizeExternalPath).toHaveBeenCalledWith({
      targetPath: '/workspace/sample-project/docs/guide.md'
    })
    expect(openFile).toHaveBeenCalledWith(
      {
        filePath: '/workspace/sample-project/docs/guide.md',
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
    expect(loaded).toEqual([])
  })

  it('still hands file:// notebooks to the editor', async () => {
    const { loaded } = load('file:///workspace/sample-project/analysis.ipynb')

    await vi.waitFor(() => expect(openFile).toHaveBeenCalled())
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/workspace/sample-project/analysis.ipynb',
        language: 'notebook'
      }),
      expect.anything()
    )
    expect(loaded).toEqual([])
  })

  it('lands rich-unsupported markdown on the rendered preview, source one click below', async () => {
    readRuntimeFilePreview.mockResolvedValue({
      content: '# Doc\n\n<Component prop="x" />',
      isBinary: false
    })
    getMarkdownRichModeUnsupportedMessage.mockReturnValue('unsupported: HTML, JSX, or MDX')

    const { loaded } = load('file:///workspace/sample-project/docs/guide.mdx')

    await vi.waitFor(() => expect(openMarkdownPreview).toHaveBeenCalled())
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/workspace/sample-project/docs/guide.mdx',
        language: 'markdown',
        mode: 'edit'
      }),
      { preview: false, targetGroupId: 'group-1' }
    )
    expect(openMarkdownPreview).toHaveBeenCalledWith(
      {
        filePath: '/workspace/sample-project/docs/guide.mdx',
        relativePath: 'docs/guide.mdx',
        worktreeId: 'wt-1',
        language: 'markdown',
        runtimeEnvironmentId: null
      },
      { targetGroupId: 'group-1' }
    )
    // The preview anchors to the edit tab, so the edit tab must exist first.
    expect(openFile.mock.invocationCallOrder[0]).toBeLessThan(
      openMarkdownPreview.mock.invocationCallOrder[0]
    )
    expect(loaded).toEqual([])
  })

  it('keeps the plain edit landing for markdown the rich editor supports', async () => {
    readRuntimeFilePreview.mockResolvedValue({
      content: '# Doc\n\n<details><summary>ok</summary>body</details>',
      isBinary: false
    })
    getMarkdownRichModeUnsupportedMessage.mockReturnValue(null)

    load('file:///workspace/sample-project/docs/guide.md')

    await vi.waitFor(() => expect(openFile).toHaveBeenCalled())
    expect(openMarkdownPreview).not.toHaveBeenCalled()
  })

  it('reads the preview probe through the same ownership context as the stat probe', async () => {
    getMarkdownRichModeUnsupportedMessage.mockReturnValue('unsupported')

    load('file:///workspace/sample-project/docs/guide.md')

    await vi.waitFor(() => expect(openMarkdownPreview).toHaveBeenCalled())
    expect(readRuntimeFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/workspace/sample-project' }),
      '/workspace/sample-project/docs/guide.md'
    )
  })

  it('does not read content for notebook handoffs', async () => {
    load('file:///workspace/sample-project/analysis.ipynb')

    await vi.waitFor(() => expect(openFile).toHaveBeenCalled())
    expect(readRuntimeFilePreview).not.toHaveBeenCalled()
    expect(openMarkdownPreview).not.toHaveBeenCalled()
  })

  it('keeps the handoff when the preview content read fails', async () => {
    readRuntimeFilePreview.mockRejectedValue(new Error('read failed'))

    const { loaded } = load('file:///workspace/sample-project/docs/guide.md')

    await vi.waitFor(() => expect(openFile).toHaveBeenCalled())
    expect(openMarkdownPreview).not.toHaveBeenCalled()
    expect(loaded).toEqual([])
  })

  it('loads markdown raw in the guest when the handoff setting is off', async () => {
    settings = { browserMarkdownEditorHandoff: false }

    const { loaded } = load('file:///workspace/sample-project/docs/guide.md')

    // Upstream behavior: no probe at all, the guest paints the raw source.
    expect(loaded).toEqual(['file:///workspace/sample-project/docs/guide.md'])
    await settle()
    expect(statRuntimePath).not.toHaveBeenCalled()
    expect(openFile).not.toHaveBeenCalled()
  })

  it('keeps the upstream notebook handoff when the markdown handoff is off', async () => {
    settings = { browserMarkdownEditorHandoff: false }

    const { loaded } = load('file:///workspace/sample-project/analysis.ipynb')

    await vi.waitFor(() => expect(openFile).toHaveBeenCalled())
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'notebook' }),
      expect.anything()
    )
    expect(loaded).toEqual([])
  })

  it('loads non-markdown file:// documents and http(s) URLs in the guest', () => {
    expect(load('file:///workspace/sample-project/notes.txt').loaded).toEqual([
      'file:///workspace/sample-project/notes.txt'
    ])
    expect(load('https://example.com/README.md').loaded).toEqual(['https://example.com/README.md'])
    expect(openFile).not.toHaveBeenCalled()
  })

  it('leaves markdown to the guest on a connection-backed workspace', async () => {
    repos = [localRepoFixture({ connectionId: 'conn-1' } as Partial<Repo>)]
    const { loaded } = load('file:///workspace/sample-project/docs/guide.md')

    await vi.waitFor(() =>
      expect(loaded).toEqual(['file:///workspace/sample-project/docs/guide.md'])
    )
    expect(openFile).not.toHaveBeenCalled()
    expect(authorizeExternalPath).not.toHaveBeenCalled()
  })

  it('resolves the owner per FILE in a mixed local/SSH folder workspace', async () => {
    // Fix 2: a workspace-level owner check saw "mixed" and refused every handoff,
    // including files a local editor could open.
    folderWorkspaces = [
      { id: 'fw-1', projectGroupId: 'pg-1', folderPath: '/workspace' } as FolderWorkspace
    ]
    projectGroups = [{ id: 'pg-1' }]
    repos = [
      { id: 'repo-local', path: '/workspace/sample-project' } as Repo,
      { id: 'repo-ssh', path: '/workspace/remote-project', connectionId: 'conn-9' } as Repo
    ]
    activeWorktreeId = 'folder:fw-1'

    const local = load('file:///workspace/sample-project/docs/guide.md', 'folder:fw-1')
    await vi.waitFor(() => expect(openFile).toHaveBeenCalled())
    expect(local.loaded).toEqual([])

    openFile.mockClear()
    const remote = load('file:///workspace/remote-project/docs/guide.md', 'folder:fw-1')
    await vi.waitFor(() =>
      expect(remote.loaded).toEqual(['file:///workspace/remote-project/docs/guide.md'])
    )
    expect(openFile).not.toHaveBeenCalled()
  })

  it('builds the probe context from the folder-workspace root, not the git worktree list', async () => {
    folderWorkspaces = [
      { id: 'fw-1', projectGroupId: 'pg-1', folderPath: '/workspace' } as FolderWorkspace
    ]
    projectGroups = [{ id: 'pg-1' }]
    repos = [{ id: 'repo-local', path: '/workspace/sample-project' } as Repo]
    activeWorktreeId = 'folder:fw-1'

    load('file:///workspace/sample-project/docs/guide.md', 'folder:fw-1')

    await vi.waitFor(() => expect(openFile).toHaveBeenCalled())
    expect(statRuntimePath).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/workspace' }),
      '/workspace/sample-project/docs/guide.md'
    )
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: 'sample-project/docs/guide.md' }),
      expect.anything()
    )
  })

  it('probes a client-local fallback page against the local host, not the workspace runtime', async () => {
    // A runtime-owned workspace can still host client-local browser pages; their
    // file:// documents live on the client disk, so the probe must stay local.
    settings = { activeRuntimeEnvironmentId: 'env-9' }
    browserPagesByWorkspace = {
      'workspace-1': [
        {
          ...page('https://example.com/elsewhere'),
          browserRuntimeEnvironmentId: null
        } as BrowserPageState
      ]
    }
    isRemoteRuntimeFileOperation.mockImplementation((...args: unknown[]) => {
      const context = args[0] as { settings?: { activeRuntimeEnvironmentId?: string | null } }
      return Boolean(context.settings?.activeRuntimeEnvironmentId)
    })

    const { loaded } = load('file:///workspace/sample-project/docs/guide.md')

    await vi.waitFor(() => expect(openFile).toHaveBeenCalled())
    expect(authorizeExternalPath).toHaveBeenCalledWith({
      targetPath: '/workspace/sample-project/docs/guide.md'
    })
    expect(statRuntimePath).toHaveBeenCalledWith(
      expect.objectContaining({ settings: { activeRuntimeEnvironmentId: null } }),
      '/workspace/sample-project/docs/guide.md'
    )
    // The rendered-preview probe must read through the same client-local owner.
    expect(readRuntimeFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({ settings: { activeRuntimeEnvironmentId: null } }),
      '/workspace/sample-project/docs/guide.md'
    )
    // The probe's verified owner must reach the editor too: without an explicit
    // null the editor would re-resolve the same path against the workspace's
    // runtime host, opening a file the probe never authorized there.
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeEnvironmentId: null }),
      expect.anything()
    )
    expect(loaded).toEqual([])
  })

  it('falls back to the guest when the markdown path is a directory', async () => {
    statRuntimePath.mockResolvedValue({ isDirectory: true })
    const { loaded } = load('file:///workspace/sample-project/weird.md')

    await vi.waitFor(() => expect(loaded).toEqual(['file:///workspace/sample-project/weird.md']))
    expect(openFile).not.toHaveBeenCalled()
  })

  it('falls back to the guest when the path cannot be authorized', async () => {
    authorizeExternalPath.mockRejectedValueOnce(new Error('denied'))
    const { loaded } = load('file:///workspace/sample-project/docs/guide.md')

    await vi.waitFor(() =>
      expect(loaded).toEqual(['file:///workspace/sample-project/docs/guide.md'])
    )
    expect(openFile).not.toHaveBeenCalled()
  })

  it('parks a page that is still holding the handed-off URL on the blank page', async () => {
    browserPagesByWorkspace = {
      'workspace-1': [page('file:///workspace/sample-project/docs/guide.md')]
    }
    const { loaded } = load('file:///workspace/sample-project/docs/guide.md')

    await vi.waitFor(() => expect(setBrowserPageUrl).toHaveBeenCalled())
    expect(setBrowserPageUrl).toHaveBeenCalledWith('page-1', ORCA_BROWSER_BLANK_URL)
    expect(updateBrowserPageState).toHaveBeenCalledWith('page-1', {
      loading: false,
      loadError: null
    })
    // Fix 3: the persistent guest is driven to blank too, so a remount cannot
    // disagree with the blank store state.
    expect(loaded).toEqual([ORCA_BROWSER_BLANK_URL])
  })

  it('leaves a page that is showing something else untouched', async () => {
    browserPagesByWorkspace = { 'workspace-1': [page('https://example.com/app')] }
    load('file:///workspace/sample-project/docs/guide.md')

    await vi.waitFor(() => expect(openFile).toHaveBeenCalled())
    expect(setBrowserPageUrl).not.toHaveBeenCalled()
  })

  it('does not park a page when the handoff was declined', async () => {
    statRuntimePath.mockResolvedValue({ isDirectory: true })
    browserPagesByWorkspace = {
      'workspace-1': [page('file:///workspace/sample-project/weird.md')]
    }
    const { loaded } = load('file:///workspace/sample-project/weird.md')

    await vi.waitFor(() => expect(loaded).toHaveLength(1))
    expect(setBrowserPageUrl).not.toHaveBeenCalled()
  })

  it('drops a stale probe superseded by a newer navigation on the same page', async () => {
    // Fix 1: navigating to B while A.md is mid-probe must not let A's late
    // completion open the editor or park the page under B.
    let releaseStat!: (value: { isDirectory: boolean }) => void
    statRuntimePath.mockImplementationOnce(
      () => new Promise<{ isDirectory: boolean }>((resolve) => (releaseStat = resolve))
    )
    const loaded: string[] = []
    const loadInGuest = (target: string): void => {
      loaded.push(target)
    }

    loadBrowserGuestUrl({
      url: 'file:///workspace/sample-project/docs/guide.md',
      worktreeId: 'wt-1',
      browserPageId: 'page-1',
      loadInGuest
    })
    loadBrowserGuestUrl({
      url: 'https://example.com/app',
      worktreeId: 'wt-1',
      browserPageId: 'page-1',
      loadInGuest
    })
    expect(loaded).toEqual(['https://example.com/app'])

    await vi.waitFor(() => expect(releaseStat).toBeTypeOf('function'))
    releaseStat({ isDirectory: false })
    await settle()

    expect(openFile).not.toHaveBeenCalled()
    expect(setBrowserPageUrl).not.toHaveBeenCalled()
    expect(loaded).toEqual(['https://example.com/app'])
  })

  it('drops a stale probe when a source that bypasses the choke point moved the page', async () => {
    // The agent bridge's CDP goto calls wc.loadURL() directly: no
    // loadBrowserGuestUrl call, and its guest-navigation events can land after
    // the probe already resolved — the store URL is the only trace left.
    let releaseStat!: (value: { isDirectory: boolean }) => void
    statRuntimePath.mockImplementationOnce(
      () => new Promise<{ isDirectory: boolean }>((resolve) => (releaseStat = resolve))
    )
    const { loaded } = load('file:///workspace/sample-project/docs/guide.md')

    await vi.waitFor(() => expect(releaseStat).toBeTypeOf('function'))
    browserPagesByWorkspace = { 'workspace-1': [page('https://cdp-target.example/app')] }
    releaseStat({ isDirectory: false })
    await settle()

    expect(openFile).not.toHaveBeenCalled()
    expect(setActiveTabType).not.toHaveBeenCalled()
    expect(loaded).toEqual([])
  })

  it('does not load a stale declined URL over an unknown-source navigation', async () => {
    // The decline path drives the guest back to the probed URL; after a CDP
    // navigation that would clobber the page the agent just opened.
    let releaseStat!: (value: { isDirectory: boolean }) => void
    statRuntimePath.mockImplementationOnce(
      () => new Promise<{ isDirectory: boolean }>((resolve) => (releaseStat = resolve))
    )
    const { loaded } = load('file:///workspace/sample-project/weird.md')

    await vi.waitFor(() => expect(releaseStat).toBeTypeOf('function'))
    browserPagesByWorkspace = { 'workspace-1': [page('https://cdp-target.example/app')] }
    releaseStat({ isDirectory: true })
    await settle()

    expect(loaded).toEqual([])
  })

  it('does not steal the active surface after a workspace switch mid-probe', async () => {
    // The commit flips the ACTIVE view to the editor; completing worktree A's
    // probe while B is active would convert B's surface to A's file.
    let releaseStat!: (value: { isDirectory: boolean }) => void
    statRuntimePath.mockImplementationOnce(
      () => new Promise<{ isDirectory: boolean }>((resolve) => (releaseStat = resolve))
    )
    const { loaded } = load('file:///workspace/sample-project/docs/guide.md')

    await vi.waitFor(() => expect(releaseStat).toBeTypeOf('function'))
    activeWorktreeId = 'wt-2'
    releaseStat({ isDirectory: false })
    await settle()

    expect(openFile).not.toHaveBeenCalled()
    expect(setActiveTabType).not.toHaveBeenCalled()
    // The defer falls back to the decline path: the guest loads the probed URL
    // (raw render in the background tab), so guest and store agree — a bare
    // return left the store on the markdown URL over a guest that never moved.
    expect(loaded).toEqual(['file:///workspace/sample-project/docs/guide.md'])
    // Decline, not handoff: the page must not be parked on the blank URL.
    expect(setBrowserPageUrl).not.toHaveBeenCalled()
  })

  it('does not grow the fence registry from navigation events on unprobed pages', () => {
    // Every guest navigation calls the invalidator; a page that never ran a
    // probe has nothing to fence, so no entry may be born here.
    const before = browserGuestUrlProbeFenceCount()
    invalidateBrowserGuestUrlProbe('page-that-never-probed-1')
    invalidateBrowserGuestUrlProbe('page-that-never-probed-2')
    expect(browserGuestUrlProbeFenceCount()).toBe(before)
  })

  it('drops fence entries for pages that no longer exist', async () => {
    browserPagesByWorkspace = {
      'workspace-1': [
        page('https://example.com/a', 'page-1'),
        page('https://example.com/b', 'page-2')
      ]
    }
    loadBrowserGuestUrl({
      url: 'https://example.com/next-a',
      worktreeId: 'wt-1',
      browserPageId: 'page-1',
      loadInGuest: () => {}
    })
    loadBrowserGuestUrl({
      url: 'https://example.com/next-b',
      worktreeId: 'wt-1',
      browserPageId: 'page-2',
      loadInGuest: () => {}
    })
    expect(browserGuestUrlProbeFenceCount()).toBeGreaterThanOrEqual(2)

    // page-1 closes; the next load must not keep its fence forever.
    browserPagesByWorkspace = { 'workspace-1': [page('https://example.com/b', 'page-2')] }
    loadBrowserGuestUrl({
      url: 'https://example.com/again',
      worktreeId: 'wt-1',
      browserPageId: 'page-2',
      loadInGuest: () => {}
    })
    expect(browserGuestUrlProbeFenceCount()).toBe(1)
  })

  it('does nothing when the page was closed while the probe ran', async () => {
    // Fix 1: a closed tab must not have its handoff open an editor tab later.
    let releaseStat!: (value: { isDirectory: boolean }) => void
    statRuntimePath.mockImplementationOnce(
      () => new Promise<{ isDirectory: boolean }>((resolve) => (releaseStat = resolve))
    )
    const { loaded } = load('file:///workspace/sample-project/docs/guide.md')

    await vi.waitFor(() => expect(releaseStat).toBeTypeOf('function'))
    browserPagesByWorkspace = {}
    releaseStat({ isDirectory: false })
    await settle()

    expect(openFile).not.toHaveBeenCalled()
    expect(loaded).toEqual([])
  })
})

// Why: the guard only holds while every guest navigation keeps funnelling through this module.
describe('browser pane guest navigation entry points', () => {
  it('assigns webview.src only from modules that route through loadBrowserGuestUrl', () => {
    const paneRoot = join(import.meta.dirname, '..')
    const sources: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
          sources.push(full)
        }
      }
    }
    walk(paneRoot)

    const assigners = sources.filter((file) =>
      /\bwebview\.src\s*=/.test(readFileSync(file, 'utf8'))
    )
    expect(assigners.map((file) => basename(file)).sort()).toEqual([
      'bind-browser-page-webview-listeners.ts',
      'navigate-browser-page-url.ts',
      'retry-browser-page-load.ts',
      'use-browser-page-webview-url-sync.ts'
    ])
    for (const file of assigners) {
      expect(readFileSync(file, 'utf8')).toContain('loadBrowserGuestUrl')
    }
  })
})
