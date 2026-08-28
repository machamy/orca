import {
  normalizeBrowserNavigationUrl,
  redactKagiSessionToken
} from '../../../../../shared/browser-url'
import type { BrowserLoadError } from '../../../../../shared/browser-workspace-types'
import { ORCA_BROWSER_BLANK_URL } from '../../../../../shared/constants'
import { BROWSER_GUEST_RECOVERY_ERROR_CODE } from '../host-guest/browser-page-guest-recovery'
import { getBrowserDisplayTitle, toDisplayUrl } from '../describe-page/browser-page-url-display'
import { loadBrowserGuestUrl } from './load-browser-guest-url'
import type {
  BrowserPageRecoveryNavigationValidation,
  BrowserPageUrlSetter,
  BrowserTabPageState
} from '../describe-page/browser-page-types'
import type { MutableRefObject } from 'react'

export type NavigateBrowserPageToUrlArgs = {
  url: string
  browserTabId: string
  worktreeId: string
  activeLoadFailureRef: MutableRefObject<BrowserLoadError | null>
  lastKnownWebviewUrlRef: MutableRefObject<string | null>
  trackNextLoadingEventRef: MutableRefObject<boolean>
  recoveryNavigationValidationRef: MutableRefObject<BrowserPageRecoveryNavigationValidation | null>
  webviewRef: MutableRefObject<Electron.WebviewTag | null>
  onSetUrlRef: MutableRefObject<BrowserPageUrlSetter>
  onUpdatePageStateRef: MutableRefObject<(tabId: string, updates: BrowserTabPageState) => void>
  setAddressBarValue: (value: string) => void
  setResourceNotice: (notice: string | null) => void
  focusWebviewNow: () => boolean
}

export function navigateBrowserPageToUrl({
  url,
  browserTabId,
  worktreeId,
  activeLoadFailureRef,
  lastKnownWebviewUrlRef,
  trackNextLoadingEventRef,
  recoveryNavigationValidationRef,
  webviewRef,
  onSetUrlRef,
  onUpdatePageStateRef,
  setAddressBarValue,
  setResourceNotice,
  focusWebviewNow
}: NavigateBrowserPageToUrlArgs): void {
  const navigateBrowserUrl = (targetUrl: string): void => {
    const browserModelUrl = redactKagiSessionToken(targetUrl)
    const normalizedBrowserModelUrl =
      normalizeBrowserNavigationUrl(browserModelUrl) ?? browserModelUrl
    const recoveryLoadError =
      activeLoadFailureRef.current?.code === BROWSER_GUEST_RECOVERY_ERROR_CODE
        ? activeLoadFailureRef.current
        : null
    setAddressBarValue(toDisplayUrl(browserModelUrl))
    onSetUrlRef.current(browserTabId, browserModelUrl)
    onUpdatePageStateRef.current(browserTabId, {
      loading: true,
      loadError: recoveryLoadError,
      title: getBrowserDisplayTitle(browserModelUrl, browserModelUrl)
    })
    setResourceNotice(null)

    const webview = webviewRef.current
    if (!webview) {
      return
    }
    trackNextLoadingEventRef.current = targetUrl !== ORCA_BROWSER_BLANK_URL
    lastKnownWebviewUrlRef.current = normalizedBrowserModelUrl
    recoveryNavigationValidationRef.current = recoveryLoadError
      ? { committed: false, started: false, targetUrl: normalizedBrowserModelUrl }
      : null
    webview.src = targetUrl
    if (targetUrl !== ORCA_BROWSER_BLANK_URL) {
      focusWebviewNow()
    }
  }

  loadBrowserGuestUrl({
    url,
    worktreeId,
    browserPageId: browserTabId,
    loadInGuest: navigateBrowserUrl
  })
}
