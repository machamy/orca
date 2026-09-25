import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Fork contract for the GitHub-style reading view (machamy.14). Both regressions were
 * invisible to unit tests of the preview itself: one is CSS, the other a theme read that
 * only goes wrong when the OS theme differs from the app's at mount.
 */
const read = (relative: string): string => readFileSync(join(__dirname, relative), 'utf8')

describe('markdown preview reading layout', () => {
  it('reserves the review-note rail only for blocks with a note or an open composer', () => {
    const css = read('../../assets/markdown-preview.css')
    expect(css).toMatch(
      /\.markdown-annotation-block:not\(\.has-review-notes\):not\(\s*:has\(> \.markdown-annotation-controls \.markdown-annotation-composer\)/
    )
    expect(css).toMatch(
      /\.markdown-annotation-list-block:not\(\.has-review-notes\):not\(\s*:has\(> \.markdown-annotation-controls \.markdown-annotation-composer\)/
    )
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 0;')
  })

  it('styles the preview body with GitHub markdown colors, loaded after the base sheet', () => {
    const main = read('../../assets/main.css')
    expect(main.indexOf("@import './markdown-preview-github.css';")).toBeGreaterThan(
      main.indexOf("@import './markdown-preview.css';")
    )
    const github = read('../../assets/markdown-preview-github.css')
    // GitHub light canvas/text and dark-default canvas/text.
    for (const color of ['#ffffff', '#1f2328', '#0d1117', '#f0f6fc']) {
      expect(github).toContain(color)
    }
  })

  it('follows the resolved app theme instead of a one-shot media query', () => {
    const foundation = read('use-markdown-preview-source-foundation.ts')
    expect(foundation).toContain('const isDark = useDocumentDarkTheme()')
    expect(foundation).not.toContain("window.matchMedia('(prefers-color-scheme: dark)')")
  })

  it('keeps the react-markdown node object off the inline code element', () => {
    expect(read('use-markdown-preview-components.tsx')).toContain(
      'code: ({ node: _node, className, children, ...props }) =>'
    )
  })
})
