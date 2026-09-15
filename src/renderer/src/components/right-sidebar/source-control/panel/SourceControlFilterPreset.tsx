/**
 * Fork: one-click extension filter for reviewing agent-written changes — the
 * files a human reads (code, data, docs) without the metas, prefabs and assets
 * that ride along in a Unity repo. The chip's label is the query it sets, so it
 * doubles as the syntax hint for typing a different set.
 */

import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

export const SOURCE_CONTROL_REVIEW_FILTER_PRESET = '.cs .json .md'

export function SourceControlFilterPreset({
  filterQuery,
  onFilterQueryChange
}: {
  filterQuery: string
  onFilterQueryChange: (query: string) => void
}): React.JSX.Element {
  const active = filterQuery.trim() === SOURCE_CONTROL_REVIEW_FILTER_PRESET
  return (
    <button
      type="button"
      // Why toggle: the chip is the fastest way back to "everything" once it is on.
      onClick={() => onFilterQueryChange(active ? '' : SOURCE_CONTROL_REVIEW_FILTER_PRESET)}
      aria-pressed={active}
      title={translate(
        'auto.components.right.sidebar.SourceControl.fork.reviewPreset.title',
        'Review preset: only code, data and docs. Type your own like ".cs .cs.meta".'
      )}
      className={cn(
        'shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] leading-none transition-colors',
        active
          ? 'border-primary/50 bg-primary/10 text-foreground'
          : 'border-border/60 text-muted-foreground hover:text-foreground'
      )}
    >
      {SOURCE_CONTROL_REVIEW_FILTER_PRESET}
    </button>
  )
}
