import { detectLanguage } from '@/lib/language-detect'
import { getConnectionIdForFileFromState } from '@/lib/connection-owner-resolution'
import { isPathInsideWorktree, toWorktreeRelativePath } from '@/lib/terminal-links'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { canOpenMarkdownPreview } from '@/components/editor/markdown-preview-controls'
import { useAppStore } from '@/store'
import {
  isRemoteRuntimeFileOperation,
  readRuntimeFilePreview,
  statRuntimePath,
  type RuntimeFileOperationArgs
} from '@/runtime/runtime-file-client'
import { settingsForRuntimeOwner } from '@/runtime/runtime-client-target'
import { normalizeBrowserNavigationUrl } from '../../../../../shared/browser-url'
import { ORCA_BROWSER_BLANK_URL } from '../../../../../shared/constants'
import { parseWorkspaceKey } from '../../../../../shared/workspace-scope'
import {
  getBrowserPageRuntimeEnvironmentId,
  getEditorRenderedPathFromBrowserUrl,
  isBrowserMarkdownEditorHandoffEnabled
} from '../describe-page/browser-page-url-display'

export type LoadBrowserGuestUrlArgs = {
  url: string
  worktreeId: string
  browserPageId: string
  loadInGuest: (url: string) => void
}

// Latest-request fence: the authorize+stat probe is async, and a stale completion
// must never steal focus into the editor or park the page under a newer URL.
const requestSequenceByPage = new Map<string, number>()
// Globally monotonic so a fence pruned and re-created (closed page id revived
// from recently-closed) can never hand a stale probe a matching id.
let nextProbeRequestId = 1

// Why: a guest-originated navigation (link click in the still-visible old page)
// supersedes an in-flight handoff probe the same as a host-driven load would.
// A page with no fence has no probe to supersede — creating one would leak an
// entry per page for every ordinary navigation.
export function invalidateBrowserGuestUrlProbe(browserPageId: string): void {
  if (requestSequenceByPage.has(browserPageId)) {
    requestSequenceByPage.set(browserPageId, nextProbeRequestId++)
  }
}

/** Test seam: the fence registry must stay bounded by the live pages. */
export function browserGuestUrlProbeFenceCount(): number {
  return requestSequenceByPage.size
}

type AppStoreState = ReturnType<typeof useAppStore.getState>

// Why: closed pages otherwise keep their fence forever; ids of live pages (and
// the page being loaded) stay, so in-flight probes still compare correctly.
function pruneClosedPageFences(store: AppStoreState, keepPageId: string): void {
  if (requestSequenceByPage.size === 0) {
    return
  }
  const livePageIds = new Set(
    Object.values(store.browserPagesByWorkspace ?? {})
      .flat()
      .map((entry) => entry.id)
  )
  for (const pageId of requestSequenceByPage.keys()) {
    if (pageId !== keepPageId && !livePageIds.has(pageId)) {
      requestSequenceByPage.delete(pageId)
    }
  }
}

function findBrowserPage(
  store: AppStoreState,
  browserPageId: string
): { id: string; url: string; browserRuntimeEnvironmentId?: string | null } | undefined {
  return Object.values(store.browserPagesByWorkspace ?? {})
    .flat()
    .find((entry) => entry.id === browserPageId)
}

// Why: the workspace can be a folder workspace, whose root never appears in allWorktrees().
function getWorkspaceRootPath(store: AppStoreState, worktreeId: string): string | null {
  const workspaceScope = parseWorkspaceKey(worktreeId)
  if (workspaceScope?.type === 'folder') {
    return (
      store.folderWorkspaces?.find((workspace) => workspace.id === workspaceScope.folderWorkspaceId)
        ?.folderPath ?? null
    )
  }
  return store.allWorktrees().find((worktree) => worktree.id === worktreeId)?.path ?? null
}

// Why: the single gate in front of every `webview.src` assignment — new-tab load, address bar, store
// URL sync and retry all pass through here, so no entry point can leak a document Chromium would
// paint as raw source.
export function loadBrowserGuestUrl({
  url,
  worktreeId,
  browserPageId,
  loadInGuest
}: LoadBrowserGuestUrlArgs): void {
  // Every call supersedes the page's in-flight probe, sync loads included.
  const storeAtLoad = useAppStore.getState()
  pruneClosedPageFences(storeAtLoad, browserPageId)
  const requestId = nextProbeRequestId++
  requestSequenceByPage.set(browserPageId, requestId)

  const editorRenderedPath = getEditorRenderedPathFromBrowserUrl(url, {
    markdownHandoff: isBrowserMarkdownEditorHandoffEnabled(storeAtLoad.settings)
  })
  if (!editorRenderedPath) {
    loadInGuest(url)
    return
  }

  void (async () => {
    // Why: a client-local fallback page can live in a runtime-owned workspace;
    // its file:// documents are on the client disk, so its ownership (not the
    // workspace's) picks the probe host.
    const currentStore = useAppStore.getState()
    const inferredRuntimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(
      currentStore,
      worktreeId
    )
    const currentPage = findBrowserPage(currentStore, browserPageId)
    const runtimeEnvironmentId = currentPage
      ? getBrowserPageRuntimeEnvironmentId(currentPage, inferredRuntimeEnvironmentId)
      : inferredRuntimeEnvironmentId
    const pageUrlAtProbeStart = currentPage ? normalizeForComparison(currentPage.url) : null
    const commitHandoff = await probeBrowserPathHandoff(
      editorRenderedPath,
      worktreeId,
      runtimeEnvironmentId
    )
    if (requestSequenceByPage.get(browserPageId) !== requestId) {
      return
    }
    const pageAtCommit = findBrowserPage(useAppStore.getState(), browserPageId)
    if (!pageAtCommit) {
      requestSequenceByPage.delete(browserPageId)
      return
    }
    // Why: CDP/agent loads call wc.loadURL() past the choke point, and their
    // guest events can land after the probe resolved — a store URL that moved
    // to something new means an unknown navigation source owns the page now.
    const pageUrlAtCommit = normalizeForComparison(pageAtCommit.url)
    if (
      pageUrlAtCommit !== normalizeForComparison(url) &&
      pageUrlAtCommit !== pageUrlAtProbeStart
    ) {
      return
    }
    if (!commitHandoff) {
      loadInGuest(url)
      return
    }
    // Why: the commit flips the ACTIVE surface to the editor; after a workspace
    // switch it would convert another workspace's view to this worktree's file.
    // Fall back to the decline path so the guest and store agree (a bare return
    // left the store on the markdown URL with a guest that never loaded it, and
    // returning to the workspace never re-probed).
    if (useAppStore.getState().activeWorktreeId !== worktreeId) {
      loadInGuest(url)
      return
    }
    commitHandoff()
    parkHandedOffBrowserPage(browserPageId, url, loadInGuest)
  })()
}

/**
 * The async probe half of a handoff: decides whether the local editor can own
 * the document, without side effects on tabs or focus. Returns the commit step
 * (openFile + tab switch) so callers can fence stale completions before it runs.
 */
async function probeBrowserPathHandoff(
  editorRenderedPath: string,
  worktreeId: string,
  runtimeEnvironmentId: string | null
): Promise<(() => void) | null> {
  const store = useAppStore.getState()
  try {
    // Why: per-FILE owner, not per-workspace — a mixed local/SSH folder workspace
    // must still hand off its locally-owned documents. Only a known-local owner
    // (null) qualifies; undefined means "cannot tell" and stays in the guest.
    if (getConnectionIdForFileFromState(store, worktreeId, editorRenderedPath) !== null) {
      return null
    }
    const workspaceRootPath = getWorkspaceRootPath(store, worktreeId)
    const fileContext: RuntimeFileOperationArgs = {
      settings: settingsForRuntimeOwner(store.settings, runtimeEnvironmentId),
      worktreeId,
      worktreePath: workspaceRootPath ?? undefined,
      connectionId: undefined
    }
    if (!isRemoteRuntimeFileOperation(fileContext, editorRenderedPath)) {
      await window.api.fs.authorizeExternalPath({ targetPath: editorRenderedPath })
    }
    const stat = await statRuntimePath(fileContext, editorRenderedPath)
    if (stat.isDirectory) {
      return null
    }

    let relativePath = editorRenderedPath
    if (workspaceRootPath && isPathInsideWorktree(editorRenderedPath, workspaceRootPath)) {
      relativePath =
        toWorktreeRelativePath(editorRenderedPath, workspaceRootPath) ?? editorRenderedPath
    }

    // Why: the handoff serves reader intent — markdown whose rich view would
    // fall back to raw source (HTML/JSX/MDX, reference links, footnotes) must
    // land rendered. Decide in the async half so the commit stays synchronous.
    const language = detectLanguage(editorRenderedPath)
    const openRenderedPreview =
      canOpenMarkdownPreview({ language, mode: 'edit' }) &&
      (await handedOffMarkdownLandsInSource(fileContext, editorRenderedPath))

    return () => {
      const current = useAppStore.getState()
      // Why: Chromium renders file:// notebooks as raw JSON and markdown as raw source; edit mode
      // defaults both to the editor's rich view.
      current.setActiveTabType('editor')
      const targetGroupId = current.ensureWorktreeRootGroup(worktreeId)
      current.openFile(
        {
          filePath: editorRenderedPath,
          relativePath,
          worktreeId,
          language,
          mode: 'edit',
          // Why: pin the owner the probe verified — explicit null keeps the
          // editor from re-resolving the path against the workspace's runtime.
          runtimeEnvironmentId
        },
        { preview: false, targetGroupId }
      )
      if (openRenderedPreview) {
        // Anchored to the edit tab just opened, so source stays one click away.
        current.openMarkdownPreview(
          {
            filePath: editorRenderedPath,
            relativePath,
            worktreeId,
            language,
            runtimeEnvironmentId
          },
          { targetGroupId }
        )
      }
    }
  } catch {
    return null
  }
}

// Why: one extra content read, markdown handoffs only, through the ownership
// context the probe already resolved (remote runtime files stay remote-read).
async function handedOffMarkdownLandsInSource(
  fileContext: RuntimeFileOperationArgs,
  filePath: string
): Promise<boolean> {
  try {
    const preview = await readRuntimeFilePreview(fileContext, filePath)
    if (preview.isBinary) {
      return false
    }
    // Dynamic import keeps TipTap's round-trip checker out of the browser-pane chunk.
    const { getMarkdownRichModeUnsupportedMessage } =
      await import('@/components/editor/markdown-rich-mode')
    return getMarkdownRichModeUnsupportedMessage(preview.content) !== null
  } catch {
    // A failed read downgrades only the landing view, never the handoff itself.
    return false
  }
}

// Why: exported so entry points that create their own tab can hand off before creating one.
export async function openBrowserPathInEditor(
  editorRenderedPath: string,
  worktreeId: string
): Promise<boolean> {
  const commitHandoff = await probeBrowserPathHandoff(
    editorRenderedPath,
    worktreeId,
    getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), worktreeId)
  )
  if (!commitHandoff) {
    return false
  }
  // Same fence as the choke point: the commit flips the ACTIVE surface, so a
  // probe finishing after a workspace switch must not convert the new
  // workspace's view. Declining routes the caller to its browser-tab fallback
  // in the ORIGINAL worktree (tab activation there is already workspace-local),
  // and returning to that workspace re-runs the handoff through the URL sync.
  if (useAppStore.getState().activeWorktreeId !== worktreeId) {
    return false
  }
  commitHandoff()
  return true
}

// Why: a page still holding the handed-off URL would re-run the handoff on every remount and could be
// restored as a stale tab, so park it on the blank page once the editor owns the document.
function parkHandedOffBrowserPage(
  browserPageId: string,
  handedOffUrl: string,
  loadInGuest: (url: string) => void
): void {
  const store = useAppStore.getState()
  const page = findBrowserPage(store, browserPageId)
  if (!page || normalizeForComparison(page.url) !== normalizeForComparison(handedOffUrl)) {
    return
  }
  store.setBrowserPageUrl(browserPageId, ORCA_BROWSER_BLANK_URL)
  store.updateBrowserPageState(browserPageId, { loading: false, loadError: null })
  // The persistent guest still holds the handed-off document; left there, a
  // remount would show it while the store says blank.
  loadInGuest(ORCA_BROWSER_BLANK_URL)
}

function normalizeForComparison(url: string): string {
  return normalizeBrowserNavigationUrl(url) ?? url
}
