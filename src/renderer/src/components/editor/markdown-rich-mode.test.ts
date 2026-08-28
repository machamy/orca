import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMarkdownRichModeUnsupportedMessage } from './markdown-rich-mode'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getMarkdownRichModeUnsupportedMessage', () => {
  it('allows markdown tables once table nodes are available in rich mode', () => {
    expect(getMarkdownRichModeUnsupportedMessage('| a | b |\n| - | - |\n| 1 | 2 |\n')).toBeNull()
  })

  it('allows plain markdown content', () => {
    expect(getMarkdownRichModeUnsupportedMessage('# Title\n\n- one\n- two\n')).toBeNull()
  })

  it('allows common raw html in markdown files', () => {
    expect(getMarkdownRichModeUnsupportedMessage('Before <span>hi</span> after\n')).toBeNull()
  })

  it('allows markdown autolinks wrapped in angle brackets', () => {
    expect(
      getMarkdownRichModeUnsupportedMessage('See <https://example.com/docs> for details.\n')
    ).toBeNull()
  })

  it('allows code fences with language info strings', () => {
    expect(getMarkdownRichModeUnsupportedMessage('```ts\nconst answer = 42\n```\n')).toBeNull()
  })

  it('ignores table syntax inside fenced code blocks', () => {
    expect(
      getMarkdownRichModeUnsupportedMessage('```md\n| a | b |\n| - | - |\n| 1 | 2 |\n```\n')
    ).toBeNull()
  })

  it('ignores jsx-looking tags inside code spans and fences', () => {
    expect(getMarkdownRichModeUnsupportedMessage('Use `<Widget />` in docs.\n')).toBeNull()
    expect(getMarkdownRichModeUnsupportedMessage('```tsx\n<Widget />\n```\n')).toBeNull()
    expect(getMarkdownRichModeUnsupportedMessage('```tsx\r\n<Widget />\r\n```\r\n')).toBeNull()
  })

  it('allows angle brackets in ordinary prose', () => {
    expect(
      getMarkdownRichModeUnsupportedMessage('Use 1 < 2 and 3 > 2 in the example.\n')
    ).toBeNull()
  })

  it('allows block html and mdx-like tags by preserving them as passthrough nodes', () => {
    expect(getMarkdownRichModeUnsupportedMessage('<Widget />\n')).toBeNull()
    expect(getMarkdownRichModeUnsupportedMessage('<div>block</div>\n')).toBeNull()
  })

  it('allows details/summary toggle blocks', () => {
    expect(
      getMarkdownRichModeUnsupportedMessage(
        '# t\n\n<details>\n<summary>a</summary>\n\nb\n\n</details>\n'
      )
    ).toBeNull()
  })

  it('allows details blocks in the generated explain-doc shape, adjacent and open included', () => {
    const content = [
      '# Quiz',
      '',
      'Intro text.',
      '',
      '<details>',
      '<summary>정답 보기</summary>',
      '',
      '- first point',
      '',
      '```ts',
      'const answer = 1',
      '```',
      '',
      '</details>',
      '',
      '<details open>',
      '<summary>Answer 2</summary>',
      '',
      'Body text.',
      '',
      '</details>',
      ''
    ].join('\n')
    expect(getMarkdownRichModeUnsupportedMessage(content)).toBeNull()
  })

  it('allows details blocks whose body carries other raw html as verbatim passthrough', () => {
    expect(
      getMarkdownRichModeUnsupportedMessage(
        '<details>\n<summary>a</summary>\n\n<video src="x"></video>\n\n</details>\n'
      )
    ).toBeNull()
  })

  it('still blocks reference-style links', () => {
    expect(getMarkdownRichModeUnsupportedMessage('[a]: https://example.com\n\n[a]\n')).toBe(
      'Editable only in code mode because this file contains reference-style links.'
    )
  })

  it('still blocks footnote definitions', () => {
    expect(getMarkdownRichModeUnsupportedMessage('x[^1]\n\n[^1]: note\n')).not.toBeNull()
  })

  it('still blocks html files above the round-trip size threshold', () => {
    const content = `<details>\n<summary>a</summary>\n\n${'b'.repeat(50_001)}\n\n</details>\n`
    expect(getMarkdownRichModeUnsupportedMessage(content)).toBe(
      'Editable only in code mode because this file contains HTML, JSX, or MDX.'
    )
  })

  it('allows markdown files with front-matter', () => {
    expect(
      getMarkdownRichModeUnsupportedMessage('---\ntitle: Hello\ntags: [a, b]\n---\n# Body\n')
    ).toBeNull()
  })

  it('allows TOML front-matter delimited by +++', () => {
    expect(getMarkdownRichModeUnsupportedMessage('+++\ntitle = "Hello"\n+++\nBody\n')).toBeNull()
  })

  it('allows front-matter with clean markdown body', () => {
    expect(
      getMarkdownRichModeUnsupportedMessage('---\ntitle: Docs\n---\n# Heading\n\n- one\n- two\n')
    ).toBeNull()
  })

  it('strips newline-heavy fenced code without splitting the full body', () => {
    const split = vi.spyOn(String.prototype, 'split')
    const content = `${'```tsx\n<Widget />\n```\n'.repeat(10_000)}# Tail\n`

    expect(getMarkdownRichModeUnsupportedMessage(content)).toBeNull()

    expect(split).not.toHaveBeenCalled()
  })

  it('preserves newline-heavy embedded html without global fragment matching', () => {
    const matchSpy = vi.spyOn(String.prototype, 'match')
    const content = `${'<span>hi</span>\n'.repeat(1_000)}Tail\n`

    expect(getMarkdownRichModeUnsupportedMessage(content)).toBeNull()

    const usedGlobalHtmlFragmentMatch = matchSpy.mock.calls.some(
      ([pattern]) =>
        pattern instanceof RegExp &&
        pattern.global &&
        pattern.source.startsWith('<!--[\\s\\S]*?-->')
    )
    expect(usedGlobalHtmlFragmentMatch).toBe(false)
  })
})
