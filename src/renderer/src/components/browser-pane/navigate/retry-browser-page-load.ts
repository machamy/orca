import { normalizeBrowserNavigationUrl } from '../../../../../shared/browser-url'
import type { BrowserPage as BrowserPageState } from '../../../../../shared/browser-workspace-types'
import { loadBrowserGuestUrl } from './load-browser-guest-url'
import type { BrowserTabPageState } from '../describe-page/browser-page-types'

export function retryBrowserTabLoad(
  webview: Electron.WebviewTag | null,
  browserTab: BrowserPageState,
  onUpdatePageState: (tabId: string, updates: BrowserTabPageState) => void
): void {
  if (!webview) {
    return
  }

  const retryUrl = normalizeBrowserNavigationUrl(
    browserTab.loadError?.validatedUrl ?? browserTab.url
  )
  if (!retryUrl) {
    return
  }

  loadBrowserGuestUrl({
    url: retryUrl,
    worktreeId: browserTab.worktreeId,
    browserPageId: browserTab.id,
    loadInGuest: (targetUrl) => {
      // Why: after chrome-error://, reload() only refreshes the error page — force navigation back to the attempted URL; keep the failure visible until success.
      onUpdatePageState(browserTab.id, {
        loading: true,
        title: targetUrl
      })
      webview.src = targetUrl
    }
  })
}
