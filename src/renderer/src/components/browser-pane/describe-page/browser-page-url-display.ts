import type { GlobalSettings } from '../../../../../shared/settings/global-settings-types'
import '../../../../../shared/orca-profiles/constants'
import {
  normalizeExternalBrowserUrl,
  redactKagiSessionToken
} from '../../../../../shared/browser/navigation/browser-url'
import { detectLanguage } from '../../../../../shared/editor-language/editor-language-detect'
import { isBlankBrowserUrl } from '@/lib/browser/palette/browser-palette-search'
import { browserFileUrlToAbsolutePath } from './browser-artifact-upload'

/** A blank tab shows an empty bar, so typing never merges into placeholder text. */
export function toDisplayUrl(url: string): string {
  return isBlankBrowserUrl(url) ? '' : redactKagiSessionToken(url)
}

export { getBrowserDisplayTitle } from '../../../../../shared/browser/browser-display-title'

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
