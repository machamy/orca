import { detectLanguage } from '../../../../../../shared/editor-language/editor-language-detect'
import type { AppState } from '../../../types'
import type { MarkdownViewMode } from '../types/open-file'
import type { GlobalSettings } from '../../../../../../shared/settings/global-settings-types'
import {
  normalizeForkMarkdownDefaultViewMode,
  type ForkMarkdownDefaultViewMode
} from '../../../../../../shared/fork-markdown-default-view-mode'

type MarkdownDefaultViewModeState = Pick<AppState, 'openFiles' | 'markdownViewMode'> & {
  settings: Pick<GlobalSettings, 'markdownDefaultViewMode'> | null
}

/**
 * Per-tab view modes after changing the Markdown default. Open Markdown tabs that were never
 * toggled are pinned to the old default so they don't flip under the user.
 */
export function markdownViewModesForNewDefault(
  state: MarkdownDefaultViewModeState,
  nextDefault: ForkMarkdownDefaultViewMode
): Record<string, MarkdownViewMode> {
  const previousDefault = normalizeForkMarkdownDefaultViewMode(
    state.settings?.markdownDefaultViewMode
  )
  const next = { ...state.markdownViewMode }
  if (previousDefault !== nextDefault) {
    for (const file of state.openFiles) {
      if (file.id in next || file.mode !== 'edit') {
        continue
      }
      if (detectLanguage(file.filePath) === 'markdown') {
        next[file.id] = previousDefault
      }
    }
  }
  return next
}
