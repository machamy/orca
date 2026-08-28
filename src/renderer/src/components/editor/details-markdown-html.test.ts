import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractDetailsSummaryHtml,
  isEditableDetailsHtmlBlock,
  matchDetailsHtmlBlock,
  parseDetailsAttributes,
  parseToggleHeadingVariant,
  type DetailsHtmlBlock
} from './details-markdown-html'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('details markdown html', () => {
  it('extracts leading summary html without regex capture', () => {
    const matchSpy = vi.spyOn(String.prototype, 'match')
    const inner = `\n<SUMMARY>${'Heading line\n'.repeat(1_000)}</SUMMARY><p>Body</p>`

    const summary = extractDetailsSummaryHtml(inner)

    expect(summary?.content).toContain('Heading line')
    expect(summary?.rawLength).toBe(inner.indexOf('<p>Body</p>'))
    const usedSummaryCapture = matchSpy.mock.calls.some(
      ([pattern]) =>
        pattern instanceof RegExp &&
        pattern.source.startsWith('^\\s*<summary') &&
        pattern.source.includes('[\\s\\S]')
    )
    expect(usedSummaryCapture).toBe(false)
  })

  it('accepts editable details blocks with newline-heavy summaries without summary matching', () => {
    const matchSpy = vi.spyOn(String.prototype, 'match')
    const block: DetailsHtmlBlock = {
      raw: '',
      openingAttributes: '',
      inner: `<summary>${'Heading line\n'.repeat(1_000)}</summary><p>Body</p>`,
      hasNestedDetails: false
    }

    expect(isEditableDetailsHtmlBlock(block)).toBe(true)
    const usedSummaryCapture = matchSpy.mock.calls.some(
      ([pattern]) =>
        pattern instanceof RegExp &&
        pattern.source.startsWith('^\\s*<summary') &&
        pattern.source.includes('[\\s\\S]')
    )
    expect(usedSummaryCapture).toBe(false)
  })

  // CommonMark: a code span closes only on a backtick run of EXACTLY the opening length.
  describe('inline-code masking honors backtick run lengths', () => {
    function detailsAround(bodyLine: string): string {
      return ['<details>', '<summary>Toggle</summary>', '', bodyLine, '', '</details>'].join('\n')
    }

    it('keeps a tag inside a double-backtick span (containing a single backtick) as code', () => {
      const content = detailsAround('Inline `` `</details>` `` stays code.')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content)
      expect(block?.inner).toContain('stays code')
    })

    it('keeps a tag as code when shorter runs sit between opener and closer', () => {
      const content = detailsAround('Span `a``</details>``b` holds the tag.')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content)
      expect(block?.inner).toContain('holds the tag')
    })

    it('treats a tag after an unclosed opener run as structure, not code', () => {
      const content = detailsAround('Unclosed `` run, then </details> ends it.')
      const block = matchDetailsHtmlBlock(content, 0)
      // The dangling `` never opens a span, so the mid-line tag closes the block.
      expect(block?.raw).toBe(content.slice(0, content.indexOf(' ends it.')))
    })

    it('still masks a plain single-backtick span', () => {
      const content = detailsAround('Plain `</details>` span.')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content)
    })

    it('keeps a tag inside a span that crosses a line break as code', () => {
      // Data-loss class: per-line ranges let this span's </details> close the
      // block mid-code, and saving rewrote the literal code as toggle markup.
      const content = detailsAround('Span `starts here\n</details> still code` ends.')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content)
      expect(block?.inner).toContain('still code')
    })

    it('honors exact-length matching across lines too', () => {
      const content = detailsAround('Span `` has ` inside\n</details> more `` done.')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content)
      expect(block?.inner).toContain('more')
    })

    it('does not let a span cross a blank line to swallow a real closing tag', () => {
      // The blank line ends the paragraph, so the dangling backtick never opens
      // a span and the tag below stays structure (a null block here would mean
      // the whole file lost its toggle).
      const content = [
        '<details>',
        '<summary>Toggle</summary>',
        '',
        'A dangling `opener',
        '',
        '</details>'
      ].join('\n')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content)
    })

    it('does not let a span reach across a fence to a backtick beyond it', () => {
      const content = [
        '<details>',
        '<summary>Toggle</summary>',
        '',
        'A dangling `opener',
        '```',
        'fenced',
        '```',
        '</details> then ` a backtick.'
      ].join('\n')
      const block = matchDetailsHtmlBlock(content, 0)
      // The fence is a paragraph boundary: the dangling opener stays unmatched
      // and the tag after the fence really closes the block.
      expect(block?.raw).toBe(content.slice(0, content.indexOf(' then `')))
    })
  })

  // CommonMark: a code span never crosses a leaf-block boundary; a heading or
  // thematic break between two backticks means they cannot be one span.
  describe('leaf-block barriers between backtick runs (data-loss class)', () => {
    it('does not let a span cross an ATX heading to swallow a real closing tag', () => {
      const content = [
        '<details>',
        '<summary>Toggle</summary>',
        '',
        'A dangling `opener',
        '# Heading',
        '</details>',
        'closing ` backtick.'
      ].join('\n')
      const block = matchDetailsHtmlBlock(content, 0)
      // The heading ends the paragraph: the opener stays unmatched and the tag
      // after the heading stays structural.
      expect(block?.raw).toBe(content.slice(0, content.indexOf('\nclosing')))
    })

    it('does not let a span cross a thematic break (*** or ---)', () => {
      for (const breakLine of ['***', '---', '- - -']) {
        const content = [
          '<details>',
          '<summary>Toggle</summary>',
          '',
          'A dangling `opener',
          breakLine,
          '</details>',
          'closing ` backtick.'
        ].join('\n')
        const block = matchDetailsHtmlBlock(content, 0)
        expect(block?.raw).toBe(content.slice(0, content.indexOf('\nclosing')))
      }
    })

    it('still masks a span contained inside a heading line', () => {
      const content = [
        '<details>',
        '<summary>Toggle</summary>',
        '',
        '# Heading `</details>` stays code',
        '',
        '</details>'
      ].join('\n')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content)
      expect(block?.inner).toContain('stays code')
    })

    it('a #hashtag line without a space is NOT a heading — the span still crosses it', () => {
      const content = [
        '<details>',
        '<summary>Toggle</summary>',
        '',
        'Span `starts',
        '#hashtag',
        '</details> still code` ends.',
        '',
        '</details>'
      ].join('\n')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content)
      expect(block?.inner).toContain('still code')
    })
  })

  // CommonMark: 4+-column lines after a blank line are an indented code block.
  describe('indented-code masking (data-loss class: tag inside code read as structure)', () => {
    it('keeps a tag inside a 4-space-indented code block as code', () => {
      const content = [
        '<details>',
        '<summary>Toggle</summary>',
        '',
        '    indented code line',
        '    </details> still code',
        '',
        '</details>'
      ].join('\n')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content)
      expect(block?.inner).toContain('still code')
    })

    it('treats a tab as code indentation too', () => {
      const content = [
        '<details>',
        '<summary>Toggle</summary>',
        '',
        '\t</details> tab-indented code',
        '',
        '</details>'
      ].join('\n')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content)
      expect(block?.inner).toContain('tab-indented code')
    })

    it('spans blank-separated chunks of one code block', () => {
      const content = [
        '<details>',
        '<summary>Toggle</summary>',
        '',
        '    first chunk',
        '',
        '    </details> second chunk',
        '',
        '</details>'
      ].join('\n')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content)
      expect(block?.inner).toContain('second chunk')
    })

    it('does not treat a paragraph continuation as code — the tag stays structure', () => {
      // Indented code cannot interrupt a paragraph (no blank line before it);
      // masking here would swallow a closing tag the author really wrote.
      const content = [
        '<details>',
        '<summary>Toggle</summary>',
        '',
        'paragraph line',
        '    </details> ends it.'
      ].join('\n')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content.slice(0, content.indexOf(' ends it.')))
    })

    it('does not treat list-item continuation as code — the tag stays structure', () => {
      // Under `1.  item` a 4-column line is item continuation, not code; the
      // ambiguity is resolved AWAY from masking so a real closing tag works.
      const content = [
        '<details>',
        '<summary>Toggle</summary>',
        '',
        '1.  a list item',
        '',
        '    </details> ends it.'
      ].join('\n')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content.slice(0, content.indexOf(' ends it.')))
    })

    it('masks again once the list has unambiguously ended', () => {
      const content = [
        '<details>',
        '<summary>Toggle</summary>',
        '',
        '- item',
        '',
        'back to flush left',
        '',
        '    </details> code again',
        '',
        '</details>'
      ].join('\n')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content)
      expect(block?.inner).toContain('code again')
    })

    it('does not let a backtick inside indented code open a span over a real closing tag', () => {
      const content = [
        '<details>',
        '<summary>Toggle</summary>',
        '',
        '    code with ` one backtick',
        '</details> then ` later.'
      ].join('\n')
      const block = matchDetailsHtmlBlock(content, 0)
      expect(block?.raw).toBe(content.slice(0, content.indexOf(' then `')))
    })
  })

  it('accepts heading-5 toggle variants and rejects unsupported levels', () => {
    expect(parseToggleHeadingVariant('heading-5')).toBe('heading-5')
    expect(parseToggleHeadingVariant('heading-6')).toBeNull()
    expect(parseDetailsAttributes(' data-orca-toggle="heading-5"')).toMatchObject({
      variant: 'heading-5'
    })
    expect(parseDetailsAttributes(' data-orca-toggle="heading-6"')).toMatchObject({
      variant: null
    })

    const editableHeading5: DetailsHtmlBlock = {
      raw: '',
      openingAttributes: ' data-orca-toggle="heading-5"',
      inner: '<summary>Toggle</summary><p>Body</p>',
      hasNestedDetails: false
    }
    const unsupportedHeading6: DetailsHtmlBlock = {
      raw: '',
      openingAttributes: ' data-orca-toggle="heading-6"',
      inner: '<summary>Toggle</summary><p>Body</p>',
      hasNestedDetails: false
    }

    expect(isEditableDetailsHtmlBlock(editableHeading5)).toBe(true)
    expect(isEditableDetailsHtmlBlock(unsupportedHeading6)).toBe(false)
  })
})
