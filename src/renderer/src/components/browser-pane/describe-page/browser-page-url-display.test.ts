import { describe, expect, it } from 'vitest'
import { ORCA_BROWSER_BLANK_URL } from '../../../../../shared/constants'
import {
  getBrowserDisplayTitle,
  getBrowserPageRuntimeEnvironmentId,
  getEditorRenderedPathFromBrowserUrl,
  getOpenableExternalUrl,
  isBrowserMarkdownEditorHandoffEnabled,
  isChromiumErrorPage,
  toDisplayUrl
} from './browser-page-url-display'
import type { BrowserPage as BrowserPageState } from '../../../../../shared/browser-workspace-types'

describe('browser page URL display', () => {
  it('maps the blank-tab sentinel to about:blank and redacts Kagi session tokens', () => {
    expect(toDisplayUrl(ORCA_BROWSER_BLANK_URL)).toBe('about:blank')
    expect(toDisplayUrl('https://kagi.com/search?q=a&token=secret')).not.toContain('secret')
  })

  it('titles blank tabs New Tab and otherwise uses the provided title', () => {
    expect(getBrowserDisplayTitle('Example', 'https://example.com')).toBe('Example')
    expect(getBrowserDisplayTitle(null, 'about:blank')).toBe('New Tab')
    expect(getBrowserDisplayTitle('about:blank', 'https://example.com')).toBe('New Tab')
    expect(getBrowserDisplayTitle('Example', ORCA_BROWSER_BLANK_URL)).toBe('New Tab')
  })

  it('detects Chromium error pages', () => {
    expect(isChromiumErrorPage('chrome-error://chromewebdata/')).toBe(true)
    expect(isChromiumErrorPage('https://example.com')).toBe(false)
  })

  it('extracts editor-rendered paths only from notebook and markdown file URLs', () => {
    expect(getEditorRenderedPathFromBrowserUrl('file:///repo/notebook.ipynb')).toBe(
      '/repo/notebook.ipynb'
    )
    expect(getEditorRenderedPathFromBrowserUrl('file:///repo/README.md')).toBe('/repo/README.md')
    expect(getEditorRenderedPathFromBrowserUrl('file:///repo/docs/Guide.MDX')).toBe(
      '/repo/docs/Guide.MDX'
    )
    expect(getEditorRenderedPathFromBrowserUrl('file:///repo/notes.markdown')).toBe(
      '/repo/notes.markdown'
    )
    expect(getEditorRenderedPathFromBrowserUrl('file:///repo/notes.txt')).toBeNull()
    expect(getEditorRenderedPathFromBrowserUrl('https://example.com/notebook.ipynb')).toBeNull()
    expect(getEditorRenderedPathFromBrowserUrl('https://example.com/README.md')).toBeNull()
  })

  it('drops markdown but keeps notebooks when the markdown handoff is disabled', () => {
    expect(
      getEditorRenderedPathFromBrowserUrl('file:///repo/README.md', { markdownHandoff: false })
    ).toBeNull()
    expect(
      getEditorRenderedPathFromBrowserUrl('file:///repo/docs/Guide.MDX', { markdownHandoff: false })
    ).toBeNull()
    // Notebooks handed off before the fork's markdown generalization; the setting must not touch them.
    expect(
      getEditorRenderedPathFromBrowserUrl('file:///repo/notebook.ipynb', { markdownHandoff: false })
    ).toBe('/repo/notebook.ipynb')
  })

  it('treats the markdown handoff setting as on unless explicitly disabled', () => {
    expect(isBrowserMarkdownEditorHandoffEnabled(undefined)).toBe(true)
    expect(isBrowserMarkdownEditorHandoffEnabled(null)).toBe(true)
    expect(isBrowserMarkdownEditorHandoffEnabled({})).toBe(true)
    expect(isBrowserMarkdownEditorHandoffEnabled({ browserMarkdownEditorHandoff: true })).toBe(true)
    expect(isBrowserMarkdownEditorHandoffEnabled({ browserMarkdownEditorHandoff: false })).toBe(
      false
    )
  })

  it('prefers the page-owned runtime environment id when present', () => {
    expect(
      getBrowserPageRuntimeEnvironmentId(
        { browserRuntimeEnvironmentId: ' env-1 ' } as BrowserPageState,
        'inferred'
      )
    ).toBe('env-1')
    expect(
      getBrowserPageRuntimeEnvironmentId(
        { browserRuntimeEnvironmentId: undefined } as BrowserPageState,
        ' inferred '
      )
    ).toBe('inferred')
    expect(
      getBrowserPageRuntimeEnvironmentId(
        { browserRuntimeEnvironmentId: '   ' } as BrowserPageState,
        'inferred'
      )
    ).toBeNull()
  })

  it('opens only normalizable external URLs', () => {
    expect(getOpenableExternalUrl('https://example.com')).toBe('https://example.com/')
    expect(getOpenableExternalUrl(ORCA_BROWSER_BLANK_URL)).toBeNull()
  })
})
