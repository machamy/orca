import type React from 'react'
import { useAppStore } from '../../store'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'
import { Button } from '../ui/button'
import { IS_INTERNAL_BUILD } from '../../../../shared/internal-build'

const FORK_GITHUB_URL = 'https://github.com/machamy/orca'

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
  if (IS_INTERNAL_BUILD) {
    return <InternalBuildUpdateNotice />
  }
  return (
    <>
      <OfficialUpdateChecksSwitch />
      <ForkUpdatesNotice />
    </>
  )
}

function ForkUpdatesNotice(): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.settings.OfficialUpdateChecksSetting.forkUpdates',
          'This fork has no automatic updates. New versions are on GitHub.'
        )}
      </p>
      <Button
        variant="outline"
        size="xs"
        onClick={() => void window.api.shell.openUrl(FORK_GITHUB_URL)}
      >
        {translate(
          'auto.components.settings.OfficialUpdateChecksSetting.openGitHub',
          'Open GitHub'
        )}
      </Button>
    </div>
  )
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
