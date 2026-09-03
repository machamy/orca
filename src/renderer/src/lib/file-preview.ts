import { toast } from 'sonner'
import {
  getEditorRenderedPathFromBrowserUrl,
  isBrowserMarkdownEditorHandoffEnabled
} from '@/components/browser-pane/describe-page/browser-page-url-display'
import { openBrowserPathInEditor } from '@/components/browser-pane/navigate/load-browser-guest-url'
import { basename } from '@/lib/path'
import { activateBrowserWorkspaceTab } from '@/lib/browser-workspace-tab-activation'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { findSiblingGroupId } from '@/store/slices/tabs'
import { browserPageDocLocationsEqual } from '../../../shared/browser-page-doc-location'
import type { BrowserPageDocLocation } from '../../../shared/browser-workspace-types'
import { findPage } from '@/store/slices/browser-page-records'
import type { BrowserPageConversionLeg } from '@/store/slices/browser-page-conversion'
import { ORCA_BROWSER_BLANK_URL } from '../../../shared/constants'
import {
  getWorkspaceFilePreviewPlan,
  type WorkspaceFilePreviewPlan
} from '@/lib/workspace-file-preview-plan'

export type PreviewableLanguage = 'html'

// Re-exported so the callers that ask "can this file be previewed, and how" keep one import site.
export {
  REMOTE_FILE_BROWSER_UNSUPPORTED_MESSAGE,
  canShowWorkspaceFileBrowserAction,
  getWorkspaceFileBrowserOpenTarget,
  getWorkspaceFilePreviewPlan,
  useWorkspaceFileBrowserActionPredicate
} from '@/lib/workspace-file-preview-plan'
export type {
  WorkspaceFileBrowserOpenTarget,
  WorkspaceFilePreviewPlan
} from '@/lib/workspace-file-preview-plan'

function openDocPreviewTab(
  state: AppState,
  params: { filePath: string; worktreeId: string; targetGroupId?: string; activate: boolean }
): void {
  const docLocation = {
    kind: 'workspace-doc' as const,
    worktreeId: params.worktreeId,
    filePath: params.filePath
  }
  // Why reuse and not a second tab: previewing a document already on screen is a request to look at
  // it, and two tabs of one document would each hold their own grant on the same file.
  const existing = (state.browserTabsByWorktree[params.worktreeId] ?? []).find((tab) =>
    browserPageDocLocationsEqual(tab.docLocation ?? null, docLocation)
  )
  if (existing) {
    if (
      !params.activate ||
      !activateBrowserWorkspaceTab({ worktreeId: params.worktreeId, workspaceId: existing.id })
    ) {
      state.setActiveBrowserTab(existing.id)
    }
    return
  }
  state.createBrowserTab(params.worktreeId, ORCA_BROWSER_BLANK_URL, {
    docLocation,
    title: basename(params.filePath) || params.filePath,
    targetGroupId: params.targetGroupId,
    // Why explicitly client-local: the document is read through a grant this desktop mints, so the
    // page never belongs to a remote runtime even when the worktree does.
    browserRuntimeEnvironmentId: null,
    // Why the caller decides: opening a file is a request to look at it, while a preview opened to
    // the side belongs beside the source the reader is still working in.
    activate: params.activate
  })
}

export function openFileInBrowserTab(params: {
  filePath: string
  worktreeId: string
}): WorkspaceFilePreviewPlan {
  const state = useAppStore.getState()
  const plan = getWorkspaceFilePreviewPlan(state, params.worktreeId, params.filePath)
  if (plan.status === 'unsupported') {
    return plan
  }
  if (plan.status === 'doc-preview') {
    openDocPreviewTab(state, { ...params, activate: true })
    return plan
  }

  const openBrowserTab = (): void => {
    // Why: re-read the store — as a handoff fallback this can run long after the click.
    useAppStore.getState().createBrowserTab(params.worktreeId, plan.url, {
      title: plan.title,
      activate: true
    })
  }

  // Why: the guest would only hand this document straight back to the editor, so a tab here would be
  // left parked on the blank page as a stray "New Tab".
  const editorRenderedPath = getEditorRenderedPathFromBrowserUrl(plan.url, {
    markdownHandoff: isBrowserMarkdownEditorHandoffEnabled(state.settings)
  })
  if (editorRenderedPath) {
    void openBrowserPathInEditor(editorRenderedPath, params.worktreeId).then((handedOff) => {
      if (!handedOff) {
        openBrowserTab()
      }
    }, openBrowserTab)
    return plan
  }

  openBrowserTab()
  return plan
}

/** The tab a document is already open in, found by every PAGE's docLocation and not just the
 *  workspace mirror — a mixed workspace whose doc page is inactive mirrors null. */
function findWorkspaceShowingDoc(
  state: AppState,
  docLocation: BrowserPageDocLocation
): { workspaceId: string; pageId: string } | null {
  for (const tab of state.browserTabsByWorktree[docLocation.worktreeId] ?? []) {
    const page = (state.browserPagesByWorkspace[tab.id] ?? []).find((candidate) =>
      browserPageDocLocationsEqual(candidate.docLocation ?? null, docLocation)
    )
    if (page) {
      return { workspaceId: tab.id, pageId: page.id }
    }
  }
  return null
}

/**
 * The address bar's way into a workspace document: reuse before converting. A document already on
 * screen is a request to look at it — two tabs of one document would each hold their own grant on
 * the same file — so an existing tab wins and the current page stays what it was; only otherwise
 * does the page convert in place.
 */
export function convertBrowserPageToWorkspaceDoc(
  pageId: string,
  docLocation: BrowserPageDocLocation,
  options?: { leg?: BrowserPageConversionLeg }
): 'activated-existing' | 'opened-in-owning-worktree' | 'converted' | 'failed' {
  const state = useAppStore.getState()
  // Why a history leg skips reuse: Back and Forward both mean "this tab, as it was" — activating
  // another tab showing the document would leave this one a web page with live provenance, so
  // history could jump there forever. A history leg's document was this tab's own, so converting
  // in place is right.
  const isHistoryLeg = options?.leg !== undefined
  const existing = isHistoryLeg ? null : findWorkspaceShowingDoc(state, docLocation)
  if (existing) {
    // Why the worktree switches first: activation is deliberately scoped to the active worktree,
    // so without the switch a cross-worktree reuse would happen entirely out of sight.
    if (state.activeWorktreeId !== docLocation.worktreeId) {
      state.setActiveWorktree(docLocation.worktreeId)
    }
    if (
      !activateBrowserWorkspaceTab({
        worktreeId: docLocation.worktreeId,
        workspaceId: existing.workspaceId
      })
    ) {
      state.setActiveBrowserTab(existing.workspaceId)
    }
    state.setActiveBrowserPage(existing.workspaceId, existing.pageId)
    return 'activated-existing'
  }
  // Why another worktree's document opens a tab there instead of converting this one: a converted
  // page keeps its workspace row, and a row whose worktree differs from its document's can never
  // be the reader's surface under the per-worktree activity slots — its guest would never take
  // focus, and every link in the document would be a dead end.
  const owningPage = findPage(state.browserPagesByWorkspace, pageId)
  if (!isHistoryLeg && owningPage && owningPage.worktreeId !== docLocation.worktreeId) {
    // The reader follows the document to its worktree; opening it out of sight is indistinguishable
    // from nothing having happened.
    if (state.activeWorktreeId !== docLocation.worktreeId) {
      state.setActiveWorktree(docLocation.worktreeId)
    }
    const plan = openFileInBrowserTab({
      filePath: docLocation.filePath,
      worktreeId: docLocation.worktreeId
    })
    if (plan.status === 'unsupported') {
      toast.error(plan.message)
      return 'failed'
    }
    return 'opened-in-owning-worktree'
  }
  return state.convertBrowserPage(pageId, { kind: 'workspace-doc', docLocation }, options)
    ? 'converted'
    : 'failed'
}

export function canPreviewLanguage(language: string): language is PreviewableLanguage {
  return language === 'html'
}

// Why: "Open Preview to the Side" mirrors the VS Code pattern — the rendered
// view goes into the group to the right of the editor, creating a right split
// if one doesn't already exist. Keeps the editor source visible alongside the
// preview instead of replacing the active tab.
export function openFilePreviewToSide(params: {
  language: string
  filePath: string
  worktreeId: string
  sourceGroupId: string | null
}): void {
  if (!canPreviewLanguage(params.language)) {
    return
  }

  const state = useAppStore.getState()
  const worktreeId = params.worktreeId
  const plan = getWorkspaceFilePreviewPlan(state, worktreeId, params.filePath)
  if (plan.status === 'unsupported') {
    toast.error(plan.message)
    return
  }

  // Resolve the group this action originated from. Prefer the caller-supplied
  // id (the tab's own group under split-pane layouts), fall back to the
  // worktree's active group.
  const sourceGroupId =
    params.sourceGroupId ??
    state.activeGroupIdByWorktree[worktreeId] ??
    state.groupsByWorktree[worktreeId]?.[0]?.id ??
    null
  if (!sourceGroupId) {
    return
  }

  const layout = state.layoutByWorktree[worktreeId] ?? null
  const existingSibling = layout ? findSiblingGroupId(layout, sourceGroupId) : null

  // Why the unfocused split on a paired workspace: the preview opens in the background, and a host
  // snapshot reads an activated empty group as a terminal pane.
  const targetGroupId =
    existingSibling ??
    (getRuntimeEnvironmentIdForWorktree(state, worktreeId)
      ? state.createEmptySplitGroup(worktreeId, sourceGroupId, 'right', { activate: false })
      : state.createEmptySplitGroup(worktreeId, sourceGroupId, 'right'))
  if (!targetGroupId) {
    return
  }

  if (plan.status === 'doc-preview') {
    openDocPreviewTab(state, {
      filePath: params.filePath,
      worktreeId,
      targetGroupId,
      activate: false
    })
    return
  }

  state.createBrowserTab(worktreeId, plan.url, {
    title: plan.title,
    targetGroupId,
    activate: true
  })
}
