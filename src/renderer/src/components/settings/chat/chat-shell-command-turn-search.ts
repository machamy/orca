import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import type { SettingsSearchEntry } from '../search/settings-search'

export const getChatShellCommandTurnSearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    targetSectionId: 'chat-shell-command-turn',
    title: translate(
      'components.settings.nativeChat.shellCommandTurnTitle',
      'Agent answers ! commands'
    ),
    description: translate(
      'components.settings.nativeChat.shellCommandTurnCopy',
      'After a !command runs, the agent reads its output and replies right away. Off, the output goes along with your next message.'
    ),
    keywords: ['shell', 'bash', '!', 'command', 'terminal']
  })
)
