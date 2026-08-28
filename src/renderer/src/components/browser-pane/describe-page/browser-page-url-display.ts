import type { BrowserPage as BrowserPageState } from '../../../../../shared/browser-workspace-types'
import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import { ORCA_BROWSER_BLANK_URL } from '../../../../../shared/constants'
import {
  normalizeExternalBrowserUrl,
  redactKagiSessionToken
} from '../../../../../shared/browser-url'
import { detectLanguage } from '@/lib/language-detect'
import { browserFileUrlToAbsolutePath } from './browser-artifact-upload'

export function getBrowserPageRuntimeEnvironmentId(
  page: Pick<BrowserPageState, 'browserRuntimeEnvironmentId'>,
  inferredRuntimeEnvironmentId: string | null | undefined
): string | null {
  if (page.browserRuntimeEnvironmentId !== undefined) {
    return page.browserRuntimeEnvironmentId?.trim() || null
  }
  return inferredRuntimeEnvironmentId?.trim() || null
}

export function toDisplayUrl(url: string): string {
  return url === ORCA_BROWSER_BLANK_URL ? 'about:blank' : redactKagiSessionToken(url)
}

export function getBrowserDisplayTitle(title: string | null | undefined, url: string): string {
  if (
    url === 'about:blank' ||
    url === ORCA_BROWSER_BLANK_URL ||
    title === 'about:blank' ||
    title === ORCA_BROWSER_BLANK_URL ||
    !title
  ) {
    return 'New Tab'
  }
  return title
}

export function isChromiumErrorPage(url: string): boolean {
  return url.startsWith('chrome-error://')
}

// Why: Chromium shows these file:// documents as raw source; the editor has a rendered view for each.
const EDITOR_RENDERED_LANGUAGES = new Set(['notebook', 'markdown'])

// Why: off restores upstream's raw browser rendering for MARKDOWN only —
// notebooks handed off before the fork's markdown generalization and keep doing so.
export function isBrowserMarkdownEditorHandoffEnabled(
  settings: Pick<GlobalSettings, 'browserMarkdownEditorHandoff'> | null | undefined
): boolean {
  return settings?.browserMarkdownEditorHandoff !== false
}

export function getEditorRenderedPathFromBrowserUrl(
  url: string,
  options?: { markdownHandoff?: boolean }
): string | null {
  const filePath = browserFileUrlToAbsolutePath(url)
  if (!filePath) {
    return null
  }
  const language = detectLanguage(filePath)
  if (!EDITOR_RENDERED_LANGUAGES.has(language)) {
    return null
  }
  return language === 'markdown' && options?.markdownHandoff === false ? null : filePath
}

export function getOpenableExternalUrl(currentUrl: string): string | null {
  return normalizeExternalBrowserUrl(redactKagiSessionToken(currentUrl))
}
