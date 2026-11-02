import type React from 'react'
import { useAppStore } from '../../store'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'

/** Fork: automatic checks for official Orca releases, off unless turned on here. */
export function OfficialUpdateChecksSetting(): React.JSX.Element {
  const enabled = useAppStore((s) => s.settings?.officialUpdateChecks === true)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const title = translate(
    'auto.components.settings.OfficialUpdateChecksSetting.title',
    'Notify about official Orca releases'
  )
  const description = translate(
    'auto.components.settings.OfficialUpdateChecksSetting.description',
    'Checks for official Orca releases in the background and shows an update card. Off by default in this fork build, because installing one replaces the fork. Check for Updates still works.'
  )
  return (
    <SearchableSetting title={title} description={description} keywords={['update', 'official']}>
      <SettingsSwitchRow
        label={title}
        description={description}
        checked={enabled}
        onChange={() => void updateSettings({ officialUpdateChecks: !enabled })}
      />
    </SearchableSetting>
  )
}
