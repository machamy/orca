import { SquareTerminal } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { NativeChatComposerModeChip } from './NativeChatComposerModeChip'

export function NativeChatComposerShellChip(props: { onExit: () => void }): React.JSX.Element {
  const t = useTranslate()
  return (
    <NativeChatComposerModeChip
      icon={SquareTerminal}
      label={t('components.native-chat.shellCommand.chip', 'Shell')}
      exitLabel={t(
        'components.native-chat.shellCommand.exitMode',
        'Runs in the chat folder. Click to remove the !'
      )}
      onExit={props.onExit}
    />
  )
}
