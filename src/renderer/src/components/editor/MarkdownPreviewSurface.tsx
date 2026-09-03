import { useEffect, useMemo, useState } from 'react'
import type { Components } from 'react-markdown'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { detectLimitedMarkdownHtml } from './markdown-limited-html-detection'
import { MarkdownTableOfContentsPanel } from './MarkdownTableOfContentsPanel'
import { MarkdownPreviewBody, type MarkdownPreviewHtmlMode } from './MarkdownPreviewBody'
import { MarkdownPreviewReviewToolbar } from './MarkdownPreviewReviewToolbar'
import { MarkdownPreviewSearchBar } from './MarkdownPreviewSearchBar'
import type { MarkdownPreviewFoundation } from './use-markdown-preview-foundation'
import type { MarkdownPreviewReviewActions } from './use-markdown-preview-review-actions'
import type { MarkdownPreviewViewport } from './use-markdown-preview-viewport'

export function MarkdownPreviewSurface({
  foundation,
  viewport,
  reviewActions,
  components,
  filePath,
  showTableOfContents,
  onCloseTableOfContents
}: {
  foundation: MarkdownPreviewFoundation
  viewport: MarkdownPreviewViewport
  reviewActions: MarkdownPreviewReviewActions
  components: Components
  filePath: string
  showTableOfContents: boolean
  onCloseTableOfContents?: () => void
}): React.JSX.Element {
  const {
    isSearchOpen,
    canShowReviewTools,
    tableOfContentsItems,
    editorFontSize,
    isDark,
    bodyRef,
    frontMatter,
    frontmatterVisible,
    frontMatterInner,
    renderedContent
  } = foundation
  // Fork feature: the default preview sanitizes raw HTML down to a small
  // whitelist, so a README written for GitHub renders with holes and nothing
  // says why. Detect that case and offer the wider, GitHub-flavored schema.
  const [htmlMode, setHtmlMode] = useState<MarkdownPreviewHtmlMode>('default')
  const limitedHtml = useMemo(() => detectLimitedMarkdownHtml(renderedContent), [renderedContent])
  // Opening another file must not inherit the previous one's opt-in.
  useEffect(() => {
    setHtmlMode('default')
  }, [filePath])

  return (
    <div className="markdown-preview-shell">
      {showTableOfContents ? (
        <MarkdownTableOfContentsPanel
          items={tableOfContentsItems}
          onClose={onCloseTableOfContents ?? (() => {})}
          onNavigate={viewport.navigateToTableOfContentsItem}
        />
      ) : null}
      <div
        ref={viewport.setRootRef}
        tabIndex={0}
        style={{ fontSize: `${editorFontSize}px` }}
        className={`markdown-preview h-full min-h-0 overflow-auto scrollbar-editor ${isDark ? 'markdown-dark' : 'markdown-light'}`}
      >
        {isSearchOpen ? (
          <MarkdownPreviewSearchBar foundation={foundation} viewport={viewport} />
        ) : null}
        {canShowReviewTools ? (
          <MarkdownPreviewReviewToolbar
            foundation={foundation}
            reviewActions={reviewActions}
            filePath={filePath}
          />
        ) : null}
        {/* Why: OS page translation can replace react-owned text nodes and crash reconciliation. */}
        <div ref={bodyRef} className="markdown-body" translate="no">
          {frontMatter && frontmatterVisible ? (
            <div className="mb-4 rounded border border-border/60 bg-muted/40 px-3 py-2">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {translate('auto.components.editor.MarkdownPreview.2b2b31382c', 'Front Matter')}
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground font-mono scrollbar-editor">
                {frontMatterInner}
              </pre>
            </div>
          ) : null}
          {limitedHtml.limited ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs">
              <span className="min-w-0 flex-1 text-muted-foreground">
                {htmlMode === 'github'
                  ? translate(
                      'auto.components.editor.MarkdownPreview.githubHtmlOn',
                      'Showing GitHub-flavored HTML ({{tags}}). This wider rendering is an Orca fork feature.',
                      { tags: limitedHtml.tags.join(', ') }
                    )
                  : translate(
                      'auto.components.editor.MarkdownPreview.githubHtmlOffer',
                      'This file uses HTML the preview strips ({{tags}}), so parts of it are missing.',
                      { tags: limitedHtml.tags.join(', ') }
                    )}
              </span>
              <Button
                size="sm"
                variant={htmlMode === 'github' ? 'ghost' : 'outline'}
                className="h-6 shrink-0 px-2 text-xs"
                onClick={() => setHtmlMode(htmlMode === 'github' ? 'default' : 'github')}
              >
                {htmlMode === 'github'
                  ? translate(
                      'auto.components.editor.MarkdownPreview.githubHtmlRevert',
                      'Back to standard view'
                    )
                  : translate(
                      'auto.components.editor.MarkdownPreview.githubHtmlApply',
                      'View as GitHub-flavored'
                    )}
              </Button>
            </div>
          ) : null}
          <MarkdownPreviewBody
            content={renderedContent}
            components={components}
            htmlMode={htmlMode}
          />
        </div>
      </div>
    </div>
  )
}
