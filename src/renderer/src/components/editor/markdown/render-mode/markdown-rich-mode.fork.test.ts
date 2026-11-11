import { describe, expect, it } from 'vitest'
import { getMarkdownRichModeUnsupportedMessage } from './markdown-rich-mode'

describe('getMarkdownRichModeUnsupportedMessage with details toggles', () => {
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
})
