import { describe, expect, it } from 'vitest'
import {
  canOpenMarkdownPreview,
  getDefaultMarkdownViewMode,
  getEditorToggleModes,
  getMarkdownViewModes,
  isMarkdownPreviewShortcut
} from './markdown-preview-controls'

describe('getMarkdownViewModes', () => {
  // Fork: preview is back in the toggle so a doc the rich editor refuses is readable in place.
  it('offers source, rich and preview for markdown edit tabs', () => {
    expect(
      getMarkdownViewModes({
        language: 'markdown',
        mode: 'edit'
      })
    ).toEqual(['source', 'rich', 'preview'])
  })

  it('offers source, rich and preview for single-file markdown diffs', () => {
    expect(
      getMarkdownViewModes({
        language: 'markdown',
        mode: 'diff',
        diffSource: 'unstaged'
      })
    ).toEqual(['source', 'rich', 'preview'])
  })

  it('does not offer preview for mermaid edit tabs', () => {
    expect(
      getMarkdownViewModes({
        language: 'mermaid',
        mode: 'edit'
      })
    ).toEqual(['source', 'rich'])
  })

  it('keeps notebook toggles to source and rich without Changes', () => {
    expect(
      getEditorToggleModes({
        language: 'notebook',
        mode: 'edit'
      })
    ).toEqual(['source', 'rich'])
  })
})

describe('markdown preview helpers', () => {
  it('defaults markdown edit tabs to preview when no default is set', () => {
    expect(
      getDefaultMarkdownViewMode({
        language: 'markdown',
        mode: 'edit'
      })
    ).toBe('preview')
  })

  it('honours the markdown default view setting', () => {
    expect(getDefaultMarkdownViewMode({ language: 'markdown', mode: 'edit' }, 'rich')).toBe('rich')
    expect(getDefaultMarkdownViewMode({ language: 'markdown', mode: 'edit' }, 'source')).toBe(
      'source'
    )
  })

  it('keeps diffs on source regardless of the markdown default', () => {
    // Why: a diff tab exists to show changes; preview would hide them.
    expect(
      getDefaultMarkdownViewMode(
        { language: 'markdown', mode: 'diff', diffSource: 'unstaged' },
        'preview'
      )
    ).toBe('source')
  })

  it('does not apply the markdown default to other languages', () => {
    expect(getDefaultMarkdownViewMode({ language: 'mermaid', mode: 'edit' }, 'preview')).toBe(
      'rich'
    )
  })

  it('defaults markdown diffs to source mode', () => {
    expect(
      getDefaultMarkdownViewMode({
        language: 'markdown',
        mode: 'diff',
        diffSource: 'unstaged'
      })
    ).toBe('source')
  })

  it('opens dedicated preview tabs only for markdown edit tabs', () => {
    expect(
      canOpenMarkdownPreview({
        language: 'markdown',
        mode: 'edit'
      })
    ).toBe(true)
    expect(
      canOpenMarkdownPreview({
        language: 'markdown',
        mode: 'diff',
        diffSource: 'unstaged'
      })
    ).toBe(false)
  })

  it('matches the VS Code-style shortcut on macOS and Windows/Linux', () => {
    expect(
      isMarkdownPreviewShortcut(
        {
          key: 'V',
          metaKey: true,
          ctrlKey: false,
          shiftKey: true,
          altKey: false
        } as KeyboardEvent,
        'darwin'
      )
    ).toBe(true)
    expect(
      isMarkdownPreviewShortcut(
        {
          key: 'v',
          metaKey: false,
          ctrlKey: true,
          shiftKey: true,
          altKey: false
        } as KeyboardEvent,
        'linux'
      )
    ).toBe(true)
    expect(
      isMarkdownPreviewShortcut(
        {
          key: 'v',
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false
        } as KeyboardEvent,
        'linux'
      )
    ).toBe(false)
  })
})
