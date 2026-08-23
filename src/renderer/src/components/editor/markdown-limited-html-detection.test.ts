import { describe, expect, it } from 'vitest'
import { detectLimitedMarkdownHtml } from './markdown-limited-html-detection'

describe('detectLimitedMarkdownHtml', () => {
  it('flags tags the default schema drops', () => {
    const found = detectLimitedMarkdownHtml('# Demo\n\n<video src="a.mp4" controls></video>\n')

    expect(found).toEqual({ limited: true, tags: ['video'] })
  })

  it('stays quiet for HTML the default schema already renders', () => {
    // rehype-sanitize's default schema is GitHub-derived, so most README HTML
    // survives today. A banner on those files would be pure noise.
    for (const markdown of [
      '<img src="a.png" width="200" height="80">',
      '<td align="right">x</td>',
      '<p align="center">x</p>',
      '<picture><source srcset="a.webp"><img src="a.png"></picture>',
      '<dl><dt>term</dt><dd>def</dd></dl>'
    ]) {
      expect(detectLimitedMarkdownHtml(markdown)).toEqual({ limited: false, tags: [] })
    }
  })

  it('does not offer the wider view for iframes, which neither schema renders', () => {
    expect(detectLimitedMarkdownHtml('<iframe src="https://x.test"></iframe>').limited).toBe(false)
  })

  it('leaves plain markdown and whitelisted HTML alone', () => {
    const markdown =
      '# Title\n\nText with **bold**.\n\n<details><summary>More</summary>ok</details>'

    expect(detectLimitedMarkdownHtml(markdown).limited).toBe(false)
  })

  it('does not flag HTML that is only being shown as code', () => {
    // A fenced block demonstrating <video> is content, not markup — offering to
    // re-render it would be nonsense.
    const markdown =
      'Example:\n\n```html\n<video src="a.mp4"></video>\n```\n\nand `<center>` inline.'

    expect(detectLimitedMarkdownHtml(markdown).limited).toBe(false)
  })

  it('ignores HTML comments', () => {
    expect(detectLimitedMarkdownHtml('<!-- <video src="x"> -->').limited).toBe(false)
  })

  it('reports each distinct tag once, sorted', () => {
    const markdown = '<center>a</center>\n<video src="1"></video>\n<video src="2"></video>'

    expect(detectLimitedMarkdownHtml(markdown).tags).toEqual(['center', 'video'])
  })
})

describe('adversarial input', () => {
  it('stays linear on a long run of backticks', () => {
    // Regression: the fence regex backtracked quadratically here — 80k
    // backticks took 3.4s, 1MB took over nine minutes, and this scan runs on
    // every markdown file opened, so a README was a renderer-wide freeze.
    const started = Date.now()
    detectLimitedMarkdownHtml('`'.repeat(200_000))

    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('stays linear on unclosed fences and long lines', () => {
    const started = Date.now()
    detectLimitedMarkdownHtml(`\`\`\`\n${'~'.repeat(100_000)}`)
    detectLimitedMarkdownHtml('<'.repeat(100_000))

    expect(Date.now() - started).toBeLessThan(1_000)
  })
})

describe('code that only looks like markup', () => {
  it('ignores an indented code block', () => {
    expect(detectLimitedMarkdownHtml('text\n\n    <video src="x"></video>').limited).toBe(false)
  })

  it('ignores a fence inside a blockquote', () => {
    const markdown = '> ```\n> <video src="x"></video>\n> ```'

    expect(detectLimitedMarkdownHtml(markdown).limited).toBe(false)
  })

  it('treats an unclosed fence as running to the end', () => {
    expect(detectLimitedMarkdownHtml('```\n<u>a</u>').limited).toBe(false)
  })

  it('still sees markup after a fence closes', () => {
    expect(detectLimitedMarkdownHtml('```\ncode\n```\n\n<video src="x"></video>').tags).toEqual([
      'video'
    ])
  })
})
