import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownPreviewBody } from './MarkdownPreviewBody'
import { parseMarkdownPreviewDocument } from './markdown-preview-document-tree'

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

  // Upstream renders large documents through a worker engine with its own pipeline entry;
  // it must share the fork's rules or a long doc would stop reading like GitHub.
  it('applies the same rules on the large-preview engine path', () => {
    const { tree } = parseMarkdownPreviewDocument('first line\nsecond line\n\n> [!NOTE]\n> Body\n')
    const serialized = JSON.stringify(tree)
    expect(serialized).toContain('markdown-alert-note')
    expect(serialized).toContain('markdown-alert-title')
    expect(serialized).not.toContain('"tagName":"br"')
    expect(serialized).not.toContain('[!NOTE]')
  })

  it('offers the GitHub-flavored HTML schema as an opt-in body mode', () => {
    const markdown = '<center>middle</center>\n'
    expect(render(markdown)).not.toContain('<center>')
    expect(
      renderToStaticMarkup(
        <MarkdownPreviewBody content={markdown} components={{}} htmlMode="github" />
      )
    ).toContain('<center>middle</center>')
  })
})
