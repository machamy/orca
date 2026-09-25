import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownPreviewBody } from './MarkdownPreviewBody'

// Fork contract: the preview renders a .md file the way GitHub's file view does.
const render = (content: string): string =>
  renderToStaticMarkup(<MarkdownPreviewBody content={content} components={{}} />)

describe('MarkdownPreviewBody GitHub parity', () => {
  it('joins soft line breaks like a GitHub file view, not a comment', () => {
    const html = render('first line\nsecond line\n')
    expect(html).toBe('<p>first line\nsecond line</p>')
    expect(html).not.toContain('<br')
  })

  it('keeps an explicit hard break', () => {
    expect(render('first line  \nsecond line\n')).toContain('<br/>')
  })

  it.each(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'])(
    'renders [!%s] as an alert',
    (marker) => {
      const type = marker.toLowerCase()
      const html = render(`> [!${marker}]\n> Body text\n`)
      expect(html).toContain(`<div class="markdown-alert markdown-alert-${type}">`)
      expect(html).toContain('<p class="markdown-alert-title">')
      expect(html).toContain('Body text')
      expect(html).not.toContain(`[!${marker}]`)
      expect(html).not.toContain('<blockquote')
    }
  )

  it('is case-insensitive like GitHub and keeps the body paragraphs', () => {
    const html = render('> [!note]\n> one\n>\n> two\n')
    expect(html).toContain('markdown-alert-note')
    expect(html).toContain('<p>one</p>')
    expect(html).toContain('<p>two</p>')
  })

  it('leaves a marker with trailing text on its line as a plain quote', () => {
    const html = render('> [!NOTE] not an alert\n')
    expect(html).toContain('<blockquote>')
    expect(html).not.toContain('markdown-alert')
  })

  it('leaves unknown markers and ordinary quotes alone', () => {
    expect(render('> [!FOO]\n> body\n')).toContain('<blockquote>')
    expect(render('> just a quote\n')).toContain('<blockquote>')
  })
})
