import type { Options as ReactMarkdownOptions } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import remarkCjkFriendly from 'remark-cjk-friendly/parseOnly'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { remarkMarkdownDocLinks } from './markdown-doc-links'
import { remarkGithubAlerts } from './markdown-github-alerts'

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
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      // Fork: `markdown-alert*` is what remarkGithubAlerts emits for `> [!NOTE]` blocks.
      [
        'className',
        /^language-[\w-]+$/,
        /^markdown-alert(?:-(?:note|tip|important|warning|caution))?$/
      ],
      'align'
    ],
    p: [...(defaultSchema.attributes?.p ?? []), ['className', 'markdown-alert-title']],
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

export type MarkdownPluginList = NonNullable<ReactMarkdownOptions['remarkPlugins']>
// Fork: no remark-breaks. A GitHub file view joins soft line breaks (only comments keep
// them), so hard-wrapped docs must reflow here to read like GitHub.
export const MARKDOWN_REMARK_PLUGINS: MarkdownPluginList = [
  remarkGfm,
  remarkCjkFriendly,
  remarkFrontmatter,
  remarkMath,
  remarkMarkdownDocLinks,
  remarkGithubAlerts
]
export const MARKDOWN_REHYPE_NORMALIZATION_PLUGINS: MarkdownPluginList = [
  [rehypeSanitize, markdownPreviewSanitizeSchema],
  rehypeSlug
]
export const MARKDOWN_REHYPE_EXPANSION_PLUGINS: MarkdownPluginList = [rehypeHighlight, rehypeKatex]

// Sanitize raw HTML before math and syntax expansion.
export const MARKDOWN_REHYPE_PLUGINS: MarkdownPluginList = [
  rehypeRaw,
  ...MARKDOWN_REHYPE_NORMALIZATION_PLUGINS,
  ...MARKDOWN_REHYPE_EXPANSION_PLUGINS
]
