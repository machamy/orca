import { memo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import { MARKDOWN_REMARK_PLUGINS, MARKDOWN_REHYPE_PLUGINS } from './markdown-preview-plugins'
import {
  MARKDOWN_GITHUB_REHYPE_PLUGINS,
  type MarkdownPreviewHtmlMode
} from './markdown-preview-github-html'
import { markdownPreviewUrlTransform } from './markdown-preview-url-transform'

// Why: find-state renders must not rebuild the full remark/rehype pipeline.
export const MarkdownPreviewBody = memo(function MarkdownPreviewBody({
  content,
  components,
  htmlMode = 'default'
}: {
  content: string
  components: Components
  /** Fork: 'github' widens the sanitizer to the HTML GitHub renders. */
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
