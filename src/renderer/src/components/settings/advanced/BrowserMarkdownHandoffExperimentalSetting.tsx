import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import { useTranslate } from '@/i18n/use-translate'
import { Label } from '../../ui/label'
import { Switch } from '../../ui/switch'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import { getExperimentalSearchEntry } from './experimental-search'

type BrowserMarkdownHandoffExperimentalSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function BrowserMarkdownHandoffExperimentalSetting({
  settings,
  updateSettings
}: BrowserMarkdownHandoffExperimentalSettingProps): React.JSX.Element {
  const t = useTranslate()
  // Why: on by default — undefined (pre-feature profiles) must read as enabled.
  const enabled = settings.browserMarkdownEditorHandoff !== false

  return (
    <SearchableSetting
      title={t(
        'auto.components.settings.ExperimentalPane.browserMarkdownHandoff.title',
        'Browser markdown handoff'
      )}
      description={t(
        'auto.components.settings.ExperimentalPane.browserMarkdownHandoff.description',
        'Open markdown file URLs from the embedded browser in the editor instead of as raw source.'
      )}
      keywords={getExperimentalSearchEntry().browserMarkdownHandoff.keywords}
      className="space-y-3 py-3"
      id="experimental-browser-markdown-handoff"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <Label>
            {t(
              'auto.components.settings.ExperimentalPane.browserMarkdownHandoff.title',
              'Browser markdown handoff'
            )}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t(
              'auto.components.settings.ExperimentalPane.browserMarkdownHandoff.copy',
              'Hands markdown file URLs (.md, .mdx) opened in the embedded browser to the editor, landing on a rendered view. Turn off to load them as raw source in a browser tab instead. Notebooks (.ipynb) always open in the editor.'
            )}
          </p>
        </div>
        <Switch
          checked={enabled}
          aria-label={t(
            'auto.components.settings.ExperimentalPane.browserMarkdownHandoff.toggleLabel',
            'Toggle browser markdown handoff'
          )}
          onCheckedChange={() => updateSettings({ browserMarkdownEditorHandoff: !enabled })}
        />
      </div>
    </SearchableSetting>
  )
}
