import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { encodeRawMarkdownHtmlForRichEditor } from '../../rich-markdown/raw-source/raw-markdown-html'
import { createRichMarkdownExtensions } from '../../rich-markdown/schema/rich-markdown-extensions'
import { createRichMarkdownEditorCodec } from '../../rich-markdown/document/rich-markdown-source-transport'

function roundTripMarkdown(content: string): string {
  const codec = createRichMarkdownEditorCodec()
  const editor = new Editor({
    element: null,
    extensions: createRichMarkdownExtensions({ codec }),
    content: encodeRawMarkdownHtmlForRichEditor(content, codec),
    contentType: 'markdown'
  })

  try {
    // Serialization can match byte-for-byte while schema-invalid content crashes on the next edit; check the document too.
    editor.state.doc.check()
    return editor.getMarkdown().trimEnd()
  } finally {
    editor.destroy()
  }
}

function markdownAfterTextReplace(content: string, search: string, replacement: string): string {
  const codec = createRichMarkdownEditorCodec()
  const editor = new Editor({
    element: null,
    extensions: createRichMarkdownExtensions({ codec }),
    content: encodeRawMarkdownHtmlForRichEditor(content, codec),
    contentType: 'markdown'
  })

  try {
    let from = -1
    editor.state.doc.descendants((node, pos) => {
      if (from !== -1 || !node.isText || !node.text) {
        return
      }
      const index = node.text.indexOf(search)
      if (index !== -1) {
        from = pos + index
      }
    })
    if (from === -1) {
      throw new Error(`Missing text: ${search}`)
    }
    editor.view.dispatch(editor.state.tr.insertText(replacement, from, from + search.length))
    return editor.getMarkdown().trimEnd()
  } finally {
    editor.destroy()
  }
}

function markdownAfterTypingBesideImage(content: string, typed: string): string {
  const codec = createRichMarkdownEditorCodec()
  const editor = new Editor({
    element: null,
    extensions: createRichMarkdownExtensions({ codec }),
    content: encodeRawMarkdownHtmlForRichEditor(content, codec),
    contentType: 'markdown'
  })

  try {
    let after = -1
    editor.state.doc.descendants((node, pos) => {
      if (after === -1 && node.type.name === 'image') {
        after = pos + node.nodeSize
      }
    })
    if (after === -1) {
      throw new Error('Missing image node')
    }
    editor.view.dispatch(editor.state.tr.insertText(typed, after, after))
    return editor.getMarkdown().trimEnd()
  } finally {
    editor.destroy()
  }
}

describe('rich markdown round trip', () => {
  it('preserves editable details blocks with their source opening tag', () => {
    expect(roundTripMarkdown('<details><summary>Toggle</summary><p>Body</p></details>\n')).toBe(
      '<details>\n<summary>Toggle</summary>\n\nBody\n\n</details>'
    )
  })

  it('preserves an image in a details summary across an edit', () => {
    expect(
      markdownAfterTextReplace(
        '<details><summary>Toggle ![i](x.png)</summary><p>Body</p></details>\n',
        'Toggle',
        'Switch'
      )
    ).toBe('<details>\n<summary>Switch ![i](x.png)</summary>\n\nBody\n\n</details>')
  })

  it('preserves heading-styled details blocks', () => {
    expect(
      roundTripMarkdown(
        '<details data-orca-toggle="heading-1"><summary>Toggle</summary><p>Body</p></details>\n'
      )
    ).toBe(
      '<details data-orca-toggle="heading-1">\n<summary>Toggle</summary>\n\nBody\n\n</details>'
    )
  })

  it.each(['heading-2', 'heading-3', 'heading-4', 'heading-5'])(
    'preserves %s-styled details blocks',
    (variant) => {
      expect(
        roundTripMarkdown(
          `<details data-orca-toggle="${variant}"><summary>Toggle</summary><p>Body</p></details>\n`
        )
      ).toBe(
        `<details data-orca-toggle="${variant}">\n<summary>Toggle</summary>\n\nBody\n\n</details>`
      )
    }
  )

  it('preserves a heading toggle attribute byte-for-byte, HTML whitespace included', () => {
    expect(
      roundTripMarkdown(
        '<details data-orca-toggle = "heading-4"><summary>Toggle</summary><p>Body</p></details>\n'
      )
    ).toBe(
      '<details data-orca-toggle = "heading-4">\n<summary>Toggle</summary>\n\nBody\n\n</details>'
    )
  })

  it('round-trips a details block in the generated explain-doc shape byte-for-byte', () => {
    const input = [
      '<details>',
      '<summary>정답 보기</summary>',
      '',
      '- first point',
      '- second point',
      '',
      '```ts',
      'const answer = 1',
      '```',
      '',
      '</details>',
      ''
    ].join('\n')
    expect(roundTripMarkdown(input)).toBe(input.trimEnd())
  })

  it('round-trips adjacent details blocks byte-for-byte, open attribute included', () => {
    const input = [
      '<details>',
      '<summary>First</summary>',
      '',
      '- item',
      '',
      '</details>',
      '',
      '<details open>',
      '<summary>Second</summary>',
      '',
      'Body text.',
      '',
      '</details>',
      ''
    ].join('\n')
    expect(roundTripMarkdown(input)).toBe(input.trimEnd())
  })

  it('keeps a stamped class attribute already present in the source', () => {
    const input = [
      '<details class="orca-details" open>',
      '<summary>Toggle</summary>',
      '',
      'Body',
      '',
      '</details>',
      ''
    ].join('\n')
    expect(roundTripMarkdown(input)).toBe(input.trimEnd())
  })

  it('keeps the source opening tag when only the body text was edited', () => {
    const input = '<details open>\n<summary>Toggle</summary>\n\nBody here\n\n</details>\n'
    expect(markdownAfterTextReplace(input, 'here', 'edited')).toBe(
      '<details open>\n<summary>Toggle</summary>\n\nBody edited\n\n</details>'
    )
  })

  it('preserves literal p/br tags inside fenced code in an editable details body', () => {
    const input = [
      '<details>',
      '<summary>Toggle</summary>',
      '',
      '```',
      '<p>hello</p>',
      '<br>',
      '```',
      '',
      '</details>',
      ''
    ].join('\n')
    expect(roundTripMarkdown(input)).toBe(input.trimEnd())
  })

  it('reopens nested toggles as editable details blocks', () => {
    expect(
      roundTripMarkdown(
        '<details><summary>Outer</summary><details><summary>Inner</summary><p>Body</p></details></details>\n'
      )
    ).toBe(
      // Why bare `<details>` and not the stamped class: the source opening tag is
      // reproduced verbatim at both levels; nesting is what this case pins.
      [
        '<details>',
        '<summary>Outer</summary>',
        '',
        '<details>',
        '<summary>Inner</summary>',
        '',
        'Body',
        '',
        '</details>',
        '',
        '</details>'
      ].join('\n')
    )
  })

  it('does not close a details block at a closing tag inside inline code', () => {
    const input = [
      '<details>',
      '<summary>Toggle</summary>',
      '',
      'Inline `</details>` stays code, and more text follows.',
      '',
      'Another paragraph.',
      '',
      '</details>',
      ''
    ].join('\n')
    expect(roundTripMarkdown(input)).toBe(input.trimEnd())
  })

  it('does not close a details block inside a double-backtick code span', () => {
    // CommonMark: `` … `` closes only on a run of exactly two backticks, so the
    // single backticks and the tag between them are all span content.
    const input = [
      '<details>',
      '<summary>Toggle</summary>',
      '',
      'Inline `` `</details>` `` stays code, and more text follows.',
      '',
      '</details>',
      ''
    ].join('\n')
    expect(roundTripMarkdown(input)).toBe(input.trimEnd())
  })

  it('keeps nested toggle bodies editable rather than inert raw html', () => {
    const markdown = markdownAfterTextReplace(
      [
        '<details class="orca-details" open>',
        '<summary>Outer</summary>',
        '',
        '<details class="orca-details" open>',
        '<summary>Inner</summary>',
        '',
        'Body',
        '',
        '</details>',
        '',
        '</details>',
        ''
      ].join('\n'),
      'Body',
      'Edited body'
    )
    expect(markdown).toContain('Edited body')
  })

  it('preserves a standalone image as its own block', () => {
    expect(roundTripMarkdown('Intro\n\n![shot](shot.png)\n\nOutro\n')).toBe(
      'Intro\n\n![shot](shot.png)\n\nOutro'
    )
    // Standalone images must stay in paragraphs so adjacent typing joins the same block.
    expect(markdownAfterTypingBesideImage('Intro\n\n![shot](shot.png)\n\nOutro\n', 'X')).toBe(
      'Intro\n\n![shot](shot.png)X\n\nOutro'
    )
  })
})
