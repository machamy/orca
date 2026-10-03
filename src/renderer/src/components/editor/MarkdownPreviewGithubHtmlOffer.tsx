import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { MarkdownPreviewHtmlMode } from './markdown-preview-github-html'

/**
 * Fork: the default preview sanitizes raw HTML down to a small whitelist, so a README
 * written for GitHub renders with holes and nothing says why. This names the stripped
 * tags and offers the wider, GitHub-flavored schema.
 */
export function MarkdownPreviewGithubHtmlOffer({
  tags,
  htmlMode,
  onChange
}: {
  tags: readonly string[]
  htmlMode: MarkdownPreviewHtmlMode
  onChange: (mode: MarkdownPreviewHtmlMode) => void
}): React.JSX.Element {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs">
      <span className="min-w-0 flex-1 text-muted-foreground">
        {htmlMode === 'github'
          ? translate(
              'auto.components.editor.MarkdownPreview.githubHtmlOn',
              'Showing GitHub-flavored HTML ({{tags}}). This wider rendering is an Orca fork feature.',
              { tags: tags.join(', ') }
            )
          : translate(
              'auto.components.editor.MarkdownPreview.githubHtmlOffer',
              'This file uses HTML the preview strips ({{tags}}), so parts of it are missing.',
              { tags: tags.join(', ') }
            )}
      </span>
      <Button
        size="sm"
        variant={htmlMode === 'github' ? 'ghost' : 'outline'}
        className="h-6 shrink-0 px-2 text-xs"
        onClick={() => onChange(htmlMode === 'github' ? 'default' : 'github')}
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
  )
}
