import { memo } from 'react'
import Markdown from 'react-markdown'
import type { Components, Options as ReactMarkdownOptions } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import remarkBreaks from 'remark-breaks'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { remarkMarkdownDocLinks } from './markdown-doc-links'
import { markdownPreviewUrlTransform } from './markdown-preview-url-transform'

export const markdownPreviewSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary', 'kbd', 'sub', 'sup', 'ins'],
  protocols: {
    ...defaultSchema.protocols,
    // Why: keep file:// through sanitize so the click handler can authorize and open the target.
    href: [...(defaultSchema.protocols?.href ?? []), 'file'],
    src: [...(defaultSchema.protocols?.src ?? []), 'file']
  },
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'id'],
    a: [...(defaultSchema.attributes?.a ?? []), 'href', 'title'],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ['className', /^language-[\w-]+$/, 'math-inline', 'math-display']
    ],
    div: [...(defaultSchema.attributes?.div ?? []), ['className', /^language-[\w-]+$/], 'align'],
    details: [
      ...(defaultSchema.attributes?.details ?? []),
      'open',
      ['className', 'orca-details'],
      ['dataOrcaToggle', 'heading-1', 'heading-2', 'heading-3', 'heading-4', 'heading-5']
    ],
    h1: [...(defaultSchema.attributes?.h1 ?? []), 'id'],
    h2: [...(defaultSchema.attributes?.h2 ?? []), 'id'],
    h3: [...(defaultSchema.attributes?.h3 ?? []), 'id'],
    h4: [...(defaultSchema.attributes?.h4 ?? []), 'id'],
    h5: [...(defaultSchema.attributes?.h5 ?? []), 'id'],
    h6: [...(defaultSchema.attributes?.h6 ?? []), 'id'],
    img: [...(defaultSchema.attributes?.img ?? []), 'src', 'alt', 'title', 'width', 'height'],
    input: [...(defaultSchema.attributes?.input ?? []), 'type', 'checked', 'disabled'],
    pre: [...(defaultSchema.attributes?.pre ?? []), ['className', /^language-[\w-]+$/]],
    span: [...(defaultSchema.attributes?.span ?? []), ['className', /^hljs(?:-[\w-]+)?$/]],
    td: [...(defaultSchema.attributes?.td ?? []), 'align'],
    th: [...(defaultSchema.attributes?.th ?? []), 'align']
  }
}

type MarkdownPluginList = NonNullable<ReactMarkdownOptions['remarkPlugins']>
const MARKDOWN_REMARK_PLUGINS: MarkdownPluginList = [
  remarkGfm,
  remarkBreaks,
  remarkFrontmatter,
  remarkMath,
  remarkMarkdownDocLinks
]
// GitHub-flavored HTML mode (fork feature): the default schema strips tags and
// attributes GitHub renders — <video>, <picture>, <center>, width/align — so a
// README written for GitHub shows holes. This schema mirrors GitHub's own
// sanitizer closely enough for those documents while still dropping scripts,
// styles and event handlers.
export const markdownGithubSanitizeSchema: SanitizeSchema = {
  ...markdownPreviewSanitizeSchema,
  protocols: {
    ...markdownPreviewSanitizeSchema.protocols,
    // Why here and not only upstream: `poster` is absent from hast-util-sanitize's
    // protocol list, so today only react-markdown's urlTransform blocks a
    // `javascript:` poster. A schema that claims to be a sanitizer should not
    // depend on the layer above it.
    poster: ['http', 'https', 'file']
  },
  tagNames: [
    ...(markdownPreviewSanitizeSchema.tagNames ?? []),
    'video',
    'source',
    'picture',
    'audio',
    'center',
    'font',
    'u',
    'mark',
    'figure',
    'figcaption',
    'abbr',
    'dl',
    'dt',
    'dd'
  ],
  attributes: {
    ...markdownPreviewSanitizeSchema.attributes,
    video: ['src', 'poster', 'controls', 'muted', 'loop', 'playsInline', 'width', 'height'],
    audio: ['src', 'controls', 'muted', 'loop'],
    source: ['src', 'type', 'srcSet', 'media'],
    img: [...(markdownPreviewSanitizeSchema.attributes?.img ?? []), 'srcSet', 'loading'],
    font: ['color', 'face', 'size'],
    abbr: ['title']
  }
}

export type MarkdownPreviewHtmlMode = 'default' | 'github'

// Why: sanitize raw HTML before KaTeX/highlight expand it.
const MARKDOWN_REHYPE_PLUGINS: MarkdownPluginList = [
  rehypeRaw,
  [rehypeSanitize, markdownPreviewSanitizeSchema],
  rehypeSlug,
  rehypeHighlight,
  rehypeKatex
]
const MARKDOWN_GITHUB_REHYPE_PLUGINS: MarkdownPluginList = [
  rehypeRaw,
  [rehypeSanitize, markdownGithubSanitizeSchema],
  rehypeSlug,
  rehypeHighlight,
  rehypeKatex
]

// Why: find-state renders must not rebuild the full remark/rehype pipeline.
export const MarkdownPreviewBody = memo(function MarkdownPreviewBody({
  content,
  components,
  htmlMode = 'default'
}: {
  content: string
  components: Components
  htmlMode?: MarkdownPreviewHtmlMode
}) {
  return (
    <Markdown
      components={components}
      urlTransform={markdownPreviewUrlTransform}
      remarkPlugins={MARKDOWN_REMARK_PLUGINS}
      rehypePlugins={
        htmlMode === 'github' ? MARKDOWN_GITHUB_REHYPE_PLUGINS : MARKDOWN_REHYPE_PLUGINS
      }
    >
      {content}
    </Markdown>
  )
})
