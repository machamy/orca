// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NATIVE_CHAT_INTERRUPTED_STATUS_TEXT,
  type NativeChatMessage
} from '../../../../shared/native-chat-types'
import { applyCommandMarkerBoundaries } from './native-chat-pending'
import type { NativeChatInteractiveSend } from './use-native-chat-interactive-send'

const INITIAL_PROMPT = JSON.stringify({
  questions: [
    {
      question: 'Tabs or spaces?',
      multiSelect: false,
      options: [{ label: 'Tabs' }, { label: 'Spaces' }]
    }
  ]
})

const storeState = {
  agentStatusByPaneKey: {
    'tab-1:leaf-1': {
      interactivePrompt: INITIAL_PROMPT as string | undefined,
      toolName: 'AskUserQuestion' as string | undefined,
      state: undefined as string | undefined
    }
  }
}

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState)
}))

import { NativeChatInteractiveCard } from './NativeChatInteractiveCard'

const mocks = {
  sendAnswer: vi.fn<NativeChatInteractiveSend['sendAnswer']>(),
  sendRaw: vi.fn<NativeChatInteractiveSend['sendRaw']>(),
  cancelPending: vi.fn<NativeChatInteractiveSend['cancelPending']>(),
  cancel: vi.fn<NativeChatInteractiveSend['cancel']>()
}

function renderCard(canSend = true): ReturnType<typeof render> {
  return render(cardElement(canSend))
}

function cardElement(
  canSend = true,
  messages?: readonly NativeChatMessage[],
  onShowingQuestionChange?: (showing: boolean) => void
): React.JSX.Element {
  return (
    <NativeChatInteractiveCard
      paneKey="tab-1:leaf-1"
      canSend={canSend}
      messages={messages}
      onShowingQuestionChange={onShowingQuestionChange}
      send={{
        sendAnswer: mocks.sendAnswer,
        sendRaw: mocks.sendRaw,
        cancelPending: mocks.cancelPending,
        cancel: mocks.cancel
      }}
    />
  )
}

function askCallMessage(question: string): NativeChatMessage {
  return {
    id: `call-${question}`,
    role: 'assistant',
    createdAt: 1,
    blocks: [
      {
        type: 'tool-call',
        name: 'AskUserQuestion',
        input: {
          questions: [
            {
              question,
              header: 'Style',
              multiSelect: false,
              options: [{ label: 'Tabs' }, { label: 'Spaces' }]
            }
          ]
        }
      }
    ]
  } as unknown as NativeChatMessage
}

function askResultMessage(): NativeChatMessage {
  return {
    id: 'result-1',
    role: 'assistant',
    createdAt: 2,
    blocks: [{ type: 'tool-result', name: 'AskUserQuestion', output: 'Tabs' }]
  } as unknown as NativeChatMessage
}

/** A tool call whose result the interrupt below replaced. */
function orphanedCallMessage(): NativeChatMessage {
  return {
    id: 'orphan-1',
    role: 'assistant',
    createdAt: 0,
    blocks: [{ type: 'tool-call', name: 'Bash', input: { command: 'sleep 999' } }]
  } as unknown as NativeChatMessage
}

function interruptedMessage(): NativeChatMessage {
  return {
    id: 'interrupt-1',
    role: 'system',
    createdAt: 0,
    blocks: [{ type: 'text', text: NATIVE_CHAT_INTERRUPTED_STATUS_TEXT }]
  } as unknown as NativeChatMessage
}

function userTurnMessage(): NativeChatMessage {
  return {
    id: 'user-1',
    role: 'user',
    createdAt: 3,
    blocks: [{ type: 'text', text: 'never mind, do this instead' }]
  } as unknown as NativeChatMessage
}

function chooseSpacesAndSubmit(): void {
  fireEvent.click(screen.getByRole('button', { name: /Spaces/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Send answer' }))
}

describe('NativeChatInteractiveCard answer lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.agentStatusByPaneKey['tab-1:leaf-1'].interactivePrompt = INITIAL_PROMPT
    storeState.agentStatusByPaneKey['tab-1:leaf-1'].state = undefined
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps the card retryable when no PTY answer was sent', () => {
    mocks.sendAnswer.mockReturnValue({ settleAfterMs: 0, waitsForVerifiedDelivery: false })
    renderCard()

    chooseSpacesAndSubmit()
    expect(screen.getByText('Tabs or spaces?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }))
    expect(mocks.sendAnswer).toHaveBeenCalledTimes(2)
  })

  it('cancels delayed PTY writes when the owning card unmounts', () => {
    mocks.sendAnswer.mockReturnValue({ settleAfterMs: 5_000, waitsForVerifiedDelivery: false })
    const rendered = renderCard()

    chooseSpacesAndSubmit()
    expect(mocks.cancelPending).not.toHaveBeenCalled()

    rendered.unmount()
    expect(mocks.cancelPending).toHaveBeenCalledOnce()
  })

  it('cancels delayed PTY writes when desktop send authority is lost', () => {
    mocks.sendAnswer.mockReturnValue({ settleAfterMs: 5_000, waitsForVerifiedDelivery: false })
    const rendered = renderCard()

    chooseSpacesAndSubmit()
    rendered.rerender(cardElement(false))

    expect(mocks.cancelPending).toHaveBeenCalledOnce()
  })

  it('shows the paced send as busy and freezes the snapshotted answer', () => {
    mocks.sendAnswer.mockReturnValue({ settleAfterMs: 5_000, waitsForVerifiedDelivery: false })
    renderCard()

    chooseSpacesAndSubmit()

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Spaces/ })).toBeDisabled()
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('cancels the old answer sequence when a replacement prompt arrives', () => {
    mocks.sendAnswer.mockReturnValue({ settleAfterMs: 5_000, waitsForVerifiedDelivery: false })
    const rendered = renderCard()
    chooseSpacesAndSubmit()

    storeState.agentStatusByPaneKey['tab-1:leaf-1'].interactivePrompt = JSON.stringify({
      questions: [
        {
          question: 'Choose a shell?',
          multiSelect: false,
          options: [{ label: 'zsh' }, { label: 'bash' }]
        }
      ]
    })
    rendered.rerender(cardElement())

    expect(mocks.cancelPending).toHaveBeenCalledOnce()
    expect(screen.getByText('Choose a shell?')).toBeInTheDocument()
  })

  it('keeps a verified send visible until delivery succeeds', () => {
    let settleDelivery: ((delivered: boolean) => void) | undefined
    mocks.sendAnswer.mockImplementation((_prompt, _selections, onDeliverySettled) => {
      settleDelivery = onDeliverySettled
      return { settleAfterMs: 500, waitsForVerifiedDelivery: true }
    })
    renderCard()

    chooseSpacesAndSubmit()
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()

    act(() => settleDelivery?.(true))
    expect(screen.queryByText('Tabs or spaces?')).not.toBeInTheDocument()
  })

  it('restores a verified send for retry when delivery is rejected', () => {
    let settleDelivery: ((delivered: boolean) => void) | undefined
    mocks.sendAnswer.mockImplementation((_prompt, _selections, onDeliverySettled) => {
      settleDelivery = onDeliverySettled
      return { settleAfterMs: 500, waitsForVerifiedDelivery: true }
    })
    renderCard()

    chooseSpacesAndSubmit()
    act(() => settleDelivery?.(false))

    expect(screen.getByRole('button', { name: 'Send answer' })).toBeEnabled()
    expect(screen.getByText('Tabs or spaces?')).toBeInTheDocument()
  })
})

// A headless host, a relay gap, or a replay can leave the pane with no live
// `interactivePrompt` while the transcript still holds the unresolved call (#11761).
describe('NativeChatInteractiveCard transcript fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.agentStatusByPaneKey['tab-1:leaf-1'].interactivePrompt = undefined
    storeState.agentStatusByPaneKey['tab-1:leaf-1'].state = undefined
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a pending transcript ask and reports the composer replacement', () => {
    const onShowingQuestionChange = vi.fn()
    render(cardElement(true, [askCallMessage('Tabs or spaces?')], onShowingQuestionChange))

    expect(screen.getByText('Tabs or spaces?')).toBeInTheDocument()
    expect(onShowingQuestionChange).toHaveBeenCalledWith(true)
  })

  it('prefers live status over the transcript when both carry a prompt', () => {
    storeState.agentStatusByPaneKey['tab-1:leaf-1'].interactivePrompt = INITIAL_PROMPT
    render(cardElement(true, [askCallMessage('Stale transcript question?')]))

    expect(screen.getByText('Tabs or spaces?')).toBeInTheDocument()
    expect(screen.queryByText('Stale transcript question?')).not.toBeInTheDocument()
  })

  it('still renders while the mirrored status says the agent is working', () => {
    // Why no state gate: the mirrored status channel is exactly what fails in the
    // reported topology, so keying the fallback on it would suppress the card.
    storeState.agentStatusByPaneKey['tab-1:leaf-1'].state = 'working'
    render(cardElement(true, [askCallMessage('Tabs or spaces?')]))

    expect(screen.getByText('Tabs or spaces?')).toBeInTheDocument()
  })

  it('stays dismissed after answering while the transcript call is still pending', () => {
    mocks.sendAnswer.mockReturnValue({ settleAfterMs: 500, waitsForVerifiedDelivery: true })
    const messages = [askCallMessage('Tabs or spaces?')]
    const rendered = render(cardElement(true, messages))

    let settleDelivery: ((delivered: boolean) => void) | undefined
    mocks.sendAnswer.mockImplementation((_prompt, _selections, onDeliverySettled) => {
      settleDelivery = onDeliverySettled
      return { settleAfterMs: 500, waitsForVerifiedDelivery: true }
    })
    chooseSpacesAndSubmit()
    act(() => settleDelivery?.(true))
    rendered.rerender(cardElement(true, messages))

    expect(screen.queryByText('Tabs or spaces?')).not.toBeInTheDocument()
  })

  it('clears once the FIFO tool result lands', () => {
    const rendered = render(cardElement(true, [askCallMessage('Tabs or spaces?')]))
    expect(screen.getByText('Tabs or spaces?')).toBeInTheDocument()

    rendered.rerender(cardElement(true, [askCallMessage('Tabs or spaces?'), askResultMessage()]))
    expect(screen.queryByText('Tabs or spaces?')).not.toBeInTheDocument()
  })

  // A tool call the user ESC'd never gets a result, so without the turn-boundary
  // reset its empty FIFO slot swallows the ask's result and the card sits over
  // the composer forever (#11761).
  it('clears the answered ask even when an earlier call was orphaned by an interrupt', () => {
    render(
      cardElement(true, [
        orphanedCallMessage(),
        interruptedMessage(),
        askCallMessage('Tabs or spaces?'),
        askResultMessage()
      ])
    )

    expect(screen.queryByText('Tabs or spaces?')).not.toBeInTheDocument()
  })

  it('drops an ask the user escaped and typed past', () => {
    render(cardElement(true, [askCallMessage('Tabs or spaces?'), userTurnMessage()]))

    expect(screen.queryByText('Tabs or spaces?')).not.toBeInTheDocument()
  })

  // The view passes the command-boundary-trimmed messages, so an ask abandoned via
  // `/clear` cannot come back as a permanent card sitting over the composer.
  it('drops an ask abandoned by /clear', () => {
    const abandoned = { ...askCallMessage('Tabs or spaces?'), timestamp: 100 }
    const trimmed = applyCommandMarkerBoundaries(
      [abandoned as unknown as NativeChatMessage],
      [{ id: 'clear-1', command: '/clear', sentAt: 200 }]
    )
    render(cardElement(true, trimmed))

    expect(screen.queryByText('Tabs or spaces?')).not.toBeInTheDocument()
  })
})
