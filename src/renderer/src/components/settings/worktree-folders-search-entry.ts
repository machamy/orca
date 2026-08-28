import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

export function getWorktreeFoldersSearchEntry(): SettingsSearchEntry {
  return {
    title: translate(
      'auto.components.settings.experimental.search.worktreeFolders.title',
      'Worktree folders'
    ),
    description: translate(
      'auto.components.settings.experimental.search.worktreeFolders.description',
      'File worktrees into named sidebar folders inside each project.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.0d24759f14',
        'experimental'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.worktreeFolders.folder',
        'folder'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.worktreeFolders.folders',
        'folders'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.worktreeFolders.worktree',
        'worktree'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.worktreeFolders.worktrees',
        'worktrees'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.worktreeFolders.sidebar',
        'sidebar'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.worktreeFolders.organize',
        'organize'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.worktreeFolders.group',
        'group'
      )
    ]
  }
}
