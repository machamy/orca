import type React from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSegmentedControl } from './SettingsFormControls'

type MarkdownDefaultView = NonNullable<GlobalSettings['markdownDefaultViewMode']>

/** Fork: which view a markdown file opens in. The per-file toggle still overrides it. */
export function MarkdownDefaultViewSetting({
  settings,
  updateSettings
}: {
  settings: Pick<GlobalSettings, 'markdownDefaultViewMode'>
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const value: MarkdownDefaultView = settings.markdownDefaultViewMode ?? 'preview'
  const title = translate(
    'auto.components.settings.fork.markdownDefaultView.title',
    'Markdown Default View'
  )
  const description = translate(
    'auto.components.settings.fork.markdownDefaultView.description',
    'How markdown files open. Preview renders like GitHub, including HTML and docs the rich editor cannot edit. The toggle in the editor switches per file.'
  )
  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={['markdown', 'preview', 'github', 'rich', 'source', 'default view', 'md']}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <div className="text-sm">{title}</div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <SettingsSegmentedControl
          value={value}
          onChange={(next) => updateSettings({ markdownDefaultViewMode: next })}
          ariaLabel={title}
          size="sm"
          options={[
            {
              value: 'preview',
              label: translate('auto.components.editor.EditorViewToggle.0d193dc03c', 'Preview')
            },
            {
              value: 'rich',
              label: translate('auto.components.editor.EditorViewToggle.aff15f94f5', 'Rich Editor')
            },
            {
              value: 'source',
              label: translate('auto.components.editor.EditorViewToggle.4d6ccb7ba6', 'Source')
            }
          ]}
        />
      </div>
    </SearchableSetting>
  )
}
