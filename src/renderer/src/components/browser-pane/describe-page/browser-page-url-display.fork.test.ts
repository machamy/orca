import { describe, expect, it } from 'vitest'
import {
  getEditorRenderedPathFromBrowserUrl,
  isBrowserMarkdownEditorHandoffEnabled
} from './browser-page-url-display'

describe('browser file URL editor handoff', () => {
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
})
