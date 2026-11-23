import { useRef } from 'react'
import { defineFixture } from '../../../../component-fixtures/component-fixture'
import { useImeEnterGestureOwnership } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import { NativeChatComposerField } from './NativeChatComposerField'

const noop = (): void => {}

function Composer({ draft, shellCommands }: { draft: string; shellCommands: boolean }) {
  const textareaRef = useRef<NativeChatComposerInput | null>(null)
  const imeEnterGesture = useImeEnterGestureOwnership()
  return (
    <NativeChatComposerField
      draftScopeKey={`fixture:${draft}`}
      textareaRef={textareaRef}
      draft={draft}
      disabled={false}
      hasPty={false}
      canSend
      autocomplete={{ mode: 'none' }}
      mentionFiles={{ files: [], loading: false, failed: false }}
      activeSuggestion={0}
      notices={[]}
      imageAttachments={[]}
      sendButtonDisabled={draft === ''}
      isWorking={false}
      hasDraft={draft !== ''}
      attachDisabled={false}
      dictationDisabled
      isDictating={false}
      isDictationHoldMode={false}
      imeEnterGesture={imeEnterGesture}
      onDraftChange={noop}
      onTextareaSelect={noop}
      onKeyDown={noop}
      onImeSettled={noop}
      onPaste={noop}
      pickerListboxId="fixture-picker"
      onChoosePickerItem={noop}
      onRetrySkills={noop}
      onChooseMentionFile={noop}
      onRemoveImageAttachment={noop}
      onAttach={noop}
      onDictationToggle={noop}
      onDictationHoldStart={noop}
      onDictationHoldEnd={noop}
      onSend={noop}
      sessionOptionsSurface={null}
      sessionOptionsSnapshot={[]}
      shellCommands={shellCommands}
    />
  )
}

/** Fork: a `!` draft in a structured chat shows shell mode. */
export const shellCommand = defineFixture({
  width: 640,
  render: () => <Composer draft="!git status" shellCommands />
})

export const plainMessage = defineFixture({
  width: 640,
  render: () => <Composer draft="git status 보여줘" shellCommands />
})
