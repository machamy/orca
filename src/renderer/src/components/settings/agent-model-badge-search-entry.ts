import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

/** Fork: the pane-corner model/effort badge. Searchable because hiding it from
 *  its own menu leaves Settings as the only way back. */
export function getAgentModelBadgeSearchEntry(): SettingsSearchEntry {
  return {
    title: translate(
      'auto.components.settings.experimental.search.agentModelBadge.title',
      'Model badge'
    ),
    description: translate(
      'auto.components.settings.experimental.search.agentModelBadge.description',
      "Show the agent's current model and reasoning effort in a corner of its pane."
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.0d24759f14',
        'experimental'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.agentModelBadge.model',
        'model'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.agentModelBadge.effort',
        'effort'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.agentModelBadge.badge',
        'badge'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.agentModelBadge.reasoning',
        'reasoning'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.agentModelBadge.pane',
        'pane'
      )
    ]
  }
}
