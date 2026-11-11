import type React from 'react'
import { useTranslation } from 'react-i18next'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { useAppStore } from '@/store'
import { useTranslate } from '@/i18n/use-translate'
import {
  FORK_MARKDOWN_DEFAULT_VIEW_MODES,
  normalizeForkMarkdownDefaultViewMode,
  type ForkMarkdownDefaultViewMode
} from '../../../../../shared/fork-markdown-default-view-mode'

type MarkdownDefaultViewContextMenuProps = {
  /** Switches the right-clicked tab through the normal toggle path (leaves Changes/plugin editors). */
  onSelectView: (mode: ForkMarkdownDefaultViewMode) => void
  children: React.ReactNode
}

/** Right-click on a Markdown tab's view switcher to choose the view new Markdown files open in. */
export function MarkdownDefaultViewContextMenu({
  onSelectView,
  children
}: MarkdownDefaultViewContextMenuProps): React.JSX.Element {
  const t = useTranslate()
  useTranslation()
  const defaultViewMode = useAppStore((s) =>
    normalizeForkMarkdownDefaultViewMode(s.settings?.markdownDefaultViewMode)
  )
  const setMarkdownDefaultViewMode = useAppStore((s) => s.setMarkdownDefaultViewMode)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex shrink-0" data-testid="markdown-view-switcher">
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>
          {t(
            'auto.components.editor.MarkdownDefaultViewContextMenu.label',
            'Default Markdown View'
          )}
        </ContextMenuLabel>
        <ContextMenuRadioGroup
          value={defaultViewMode}
          onValueChange={(value) => {
            const mode = normalizeForkMarkdownDefaultViewMode(value)
            setMarkdownDefaultViewMode(mode)
            onSelectView(mode)
          }}
        >
          {FORK_MARKDOWN_DEFAULT_VIEW_MODES.map((mode) => (
            <ContextMenuRadioItem key={mode} value={mode}>
              {mode === 'preview'
                ? t('auto.components.editor.EditorViewToggle.0d193dc03c', 'Preview')
                : mode === 'source'
                  ? t('auto.components.editor.EditorViewToggle.4d6ccb7ba6', 'Source')
                  : t('auto.components.editor.EditorViewToggle.aff15f94f5', 'Rich Editor')}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}
