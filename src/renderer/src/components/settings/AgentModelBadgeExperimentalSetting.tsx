import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  AGENT_MODEL_BADGE_CORNERS,
  resolveAgentModelBadgeSettings,
  type AgentModelBadgeCorner
} from '../../../../shared/agent-model-badge-settings'
import { translate } from '@/i18n/i18n'
import { Label } from '../ui/label'
import { getExperimentalSearchEntry } from './experimental-search'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSegmentedControl, SettingsSwitch } from './SettingsFormControls'

function cornerLabel(corner: AgentModelBadgeCorner): string {
  switch (corner) {
    case 'top-left':
      return translate('auto.components.settings.agentModelBadge.corner.topLeft', 'Top left')
    case 'top-right':
      return translate('auto.components.settings.agentModelBadge.corner.topRight', 'Top right')
    case 'bottom-right':
      return translate(
        'auto.components.settings.agentModelBadge.corner.bottomRight',
        'Bottom right'
      )
  }
}

export function AgentModelBadgeExperimentalSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const entry = getExperimentalSearchEntry().agentModelBadge
  const badge = resolveAgentModelBadgeSettings(settings.agentModelBadge)

  return (
    <SearchableSetting
      title={entry.title}
      description={entry.description}
      keywords={entry.keywords}
      className="space-y-3 py-2"
      id="agent-model-badge"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <Label>{entry.title}</Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.agentModelBadge.copy',
              "Shows the agent's model and reasoning effort in a corner of each agent pane. A dimmed, italic badge means the values are what Orca launched with and the agent has not reported back — Codex changes its model in its own picker, which Orca cannot read. Right- or left-click the badge to move or hide it."
            )}
          </p>
        </div>
        <SettingsSwitch
          checked={badge.enabled}
          ariaLabel={translate(
            'auto.components.settings.agentModelBadge.toggleLabel',
            'Toggle model badge'
          )}
          onChange={() =>
            updateSettings({ agentModelBadge: { ...badge, enabled: !badge.enabled } })
          }
        />
      </div>
      {badge.enabled ? (
        <SettingsSegmentedControl
          value={badge.corner}
          onChange={(corner) => updateSettings({ agentModelBadge: { ...badge, corner } })}
          ariaLabel={translate(
            'auto.components.settings.agentModelBadge.positionLabel',
            'Model badge position'
          )}
          size="sm"
          options={AGENT_MODEL_BADGE_CORNERS.map((corner) => ({
            value: corner,
            label: cornerLabel(corner)
          }))}
        />
      ) : null}
    </SearchableSetting>
  )
}
