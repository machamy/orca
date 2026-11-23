import type { GlobalSettings } from '../../../../../shared/settings/global-settings-types'
import { SettingsSwitchRow } from '../form-controls/SettingsFormControls'
import { useAppStore } from '../../../store/index'
import { matchesSettingsSearch } from '../search/settings-search'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import { SettingsGroup } from '../section-layout/SettingsGroup'
import { getChatShellCommandTurnSearchEntry } from './chat-shell-command-turn-search'

/** Fork: whether a chat's `!cmd` starts an agent turn on its output. */
export function NativeChatShellCommandTurnSetting({
  settings,
  updateSettings,
  forceVisible = false
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  forceVisible?: boolean
}): React.JSX.Element | null {
  const enabled = settings.nativeChatShellCommandStartsTurn !== false
  const entry = getChatShellCommandTurnSearchEntry()
  const query = useAppStore((state) => state.settingsSearchQuery)
  if (!forceVisible && !matchesSettingsSearch(query, [entry])) {
    return null
  }
  return (
    <SettingsGroup>
      <SearchableSetting
        {...entry}
        id={entry.targetSectionId}
        forceVisible={forceVisible}
        className="max-w-none"
      >
        <SettingsSwitchRow
          label={entry.title}
          description={entry.description}
          checked={enabled}
          ariaLabel={entry.title}
          onChange={() => updateSettings({ nativeChatShellCommandStartsTurn: !enabled })}
        />
      </SearchableSetting>
    </SettingsGroup>
  )
}
