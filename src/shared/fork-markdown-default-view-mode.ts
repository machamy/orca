import type { MarkdownDefaultViewMode } from './editor/markdown/markdown-default-view-mode'

/** Fork: Preview joins upstream's Source/Rich choices and is the default, so docs the rich editor refuses read rendered. */
export type ForkMarkdownDefaultViewMode = MarkdownDefaultViewMode | 'preview'

export const FORK_DEFAULT_MARKDOWN_VIEW_MODE: ForkMarkdownDefaultViewMode = 'preview'

export const FORK_MARKDOWN_DEFAULT_VIEW_MODES = [
  'preview',
  'rich',
  'source'
] as const satisfies readonly ForkMarkdownDefaultViewMode[]

export function normalizeForkMarkdownDefaultViewMode(value: unknown): ForkMarkdownDefaultViewMode {
  return value === 'rich' || value === 'source' ? value : FORK_DEFAULT_MARKDOWN_VIEW_MODE
}
