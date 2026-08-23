import { describe, expect, it } from 'vitest'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { markdownGithubSanitizeSchema, markdownPreviewSanitizeSchema } from './MarkdownPreview'

type Node = {
  type?: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: Node[]
}

/** The real pipeline, so these assert what the preview actually renders. */
function sanitize(markdown: string, schema: object): Node {
  return unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, schema)
    .runSync(unified().use(remarkParse).parse(markdown)) as Node
}

function walk(node: Node, visit: (n: Node) => void): void {
  visit(node)
  for (const child of node.children ?? []) {
    walk(child, visit)
  }
}

function tags(tree: Node): string[] {
  const found: string[] = []
  walk(tree, (n) => {
    if (n.tagName) {
      found.push(n.tagName)
    }
  })
  return found
}

function propsOf(tree: Node, tagName: string): Record<string, unknown> {
  let props: Record<string, unknown> = {}
  walk(tree, (n) => {
    if (n.tagName === tagName) {
      props = { ...props, ...n.properties }
    }
  })
  return props
}

function text(tree: Node): string {
  let out = ''
  walk(tree, (n) => {
    if (n.type === 'text') {
      out += n.value ?? ''
    }
  })
  return out
}

describe('GitHub-flavored schema', () => {
  it('renders the tags the default schema drops', () => {
    const markdown = '<video src="demo.mp4" controls width="400"></video>'

    expect(tags(sanitize(markdown, markdownPreviewSanitizeSchema))).not.toContain('video')
    const github = sanitize(markdown, markdownGithubSanitizeSchema)
    expect(tags(github)).toContain('video')
    expect(propsOf(github, 'video').width).toBe(400)
  })

  it('revives exactly the tags the notice offers, and nothing it does not', () => {
    // Keeps the detection list honest: every tag it flags must actually come
    // back, or the button promises something it does not deliver.
    const offered = [
      'video',
      'audio',
      'center',
      'font',
      'u',
      'mark',
      'figure',
      'figcaption',
      'abbr'
    ]
    for (const tag of offered) {
      const markdown = `<${tag}>x</${tag}>`
      expect(tags(sanitize(markdown, markdownPreviewSanitizeSchema))).not.toContain(tag)
      expect(tags(sanitize(markdown, markdownGithubSanitizeSchema))).toContain(tag)
    }
  })

  it('keeps sizing attributes on the tags it adds', () => {
    expect(
      propsOf(
        sanitize('<video src="a.mp4" width="400"></video>', markdownGithubSanitizeSchema),
        'video'
      ).width
    ).toBe(400)
  })
})

describe('the wider schema is still a sanitizer', () => {
  // The point of routing through rehype-sanitize rather than raw HTML: being
  // GitHub-like must not mean executing what a repo file says.
  it('drops script elements and their contents', () => {
    const tree = sanitize('<script>alert(1)</script>', markdownGithubSanitizeSchema)

    expect(tags(tree)).not.toContain('script')
    expect(text(tree)).not.toContain('alert')
  })

  it.each([
    ['event handler', '<video src="a.mp4" onerror="alert(1)"></video>', 'video', 'onError'],
    ['inline style', '<center style="position:fixed">x</center>', 'center', 'style']
  ])('drops %s', (_label, markdown, tag, prop) => {
    expect(propsOf(sanitize(markdown, markdownGithubSanitizeSchema), tag)[prop]).toBeUndefined()
  })

  it('drops iframes', () => {
    expect(
      tags(sanitize('<iframe src="https://evil.test"></iframe>', markdownGithubSanitizeSchema))
    ).not.toContain('iframe')
  })

  it('drops javascript: hrefs', () => {
    const props = propsOf(sanitize('[x](javascript:alert(1))', markdownGithubSanitizeSchema), 'a')

    expect(String(props.href ?? '')).not.toContain('javascript:')
  })
})
