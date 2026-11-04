import type React from 'react'
import { useAppStore } from '../../store'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'
import { IS_INTERNAL_BUILD } from '../../../../shared/internal-build'

function InternalBuildUpdateNotice(): React.JSX.Element {
  return (
    <p className="text-xs text-muted-foreground">
      {translate(
        'auto.components.settings.OfficialUpdateChecksSetting.internalBuild',
        'Internal build. New versions come from the company update folder, and official Orca releases are never offered.'
      )}
    </p>
  )
}

/** Fork: automatic checks for official Orca releases, off unless turned on here. */
export function OfficialUpdateChecksSetting(): React.JSX.Element {
  return IS_INTERNAL_BUILD ? <InternalBuildUpdateNotice /> : <OfficialUpdateChecksSwitch />
}

function OfficialUpdateChecksSwitch(): React.JSX.Element {
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
