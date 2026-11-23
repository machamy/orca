import { createElement, type ReactNode } from 'react'
import { SquareTerminal } from 'lucide-react-native'
import { isNativeChatShellCommandDraft } from '../../../../../../src/shared/native-chat/native-chat-shell-command'
import { useMobileTranslation } from '../../../../i18n/use-mobile-translation'
import { colors } from '../../../../theme/mobile-theme'
import { MobileNativeChatComposerModeChip } from './MobileNativeChatComposerModeChip'

/** Fork: desktop's shell mode — a structured chat runs a `!` draft on its host, so the composer says so. */
export function useMobileNativeChatComposerShellMode(
  available: boolean,
  value: string,
  onChangeText: (text: string) => void
): { barStyle: { borderColor: string } | undefined; chip: ReactNode } {
  const t = useMobileTranslation()
  if (!available || !isNativeChatShellCommandDraft(value)) {
    return { barStyle: undefined, chip: null }
  }
  return {
    barStyle: { borderColor: colors.statusAmber },
    chip: createElement(MobileNativeChatComposerModeChip, {
      icon: SquareTerminal,
      label: t('chat.shellCommand.chip', 'Shell'),
      exitLabel: t('chat.shellCommand.exitMode', 'Runs in the chat folder. Tap to remove the !'),
      testID: 'native-chat-shell-chip',
      onExit: () => onChangeText(value.slice(1))
    })
  }
}
