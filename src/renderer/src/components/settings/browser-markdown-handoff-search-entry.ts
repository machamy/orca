import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

export function getBrowserMarkdownHandoffSearchEntry(): SettingsSearchEntry {
  return {
    title: translate(
      'auto.components.settings.experimental.search.browserMarkdownHandoff.title',
      'Browser markdown handoff'
    ),
    description: translate(
      'auto.components.settings.experimental.search.browserMarkdownHandoff.description',
      'Open markdown file URLs from the embedded browser in the editor instead of as raw source.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.0d24759f14',
        'experimental'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.browserMarkdownHandoff.markdown',
        'markdown'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.browserMarkdownHandoff.mdx',
        'mdx'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.browserMarkdownHandoff.browser',
        'browser'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.browserMarkdownHandoff.handoff',
        'handoff'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.browserMarkdownHandoff.editor',
        'editor'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.browserMarkdownHandoff.preview',
        'preview'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.browserMarkdownHandoff.raw',
        'raw'
      )
    ]
  }
}
