import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { type Options as SanitizeSchema } from 'rehype-sanitize'
import {
  MARKDOWN_REHYPE_EXPANSION_PLUGINS,
  markdownPreviewSanitizeSchema,
  type MarkdownPluginList
} from './markdown-preview-plugins'
import rehypeSlug from 'rehype-slug'

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

export const MARKDOWN_GITHUB_REHYPE_PLUGINS: MarkdownPluginList = [
  rehypeRaw,
  [rehypeSanitize, markdownGithubSanitizeSchema],
  rehypeSlug,
  ...MARKDOWN_REHYPE_EXPANSION_PLUGINS
]
