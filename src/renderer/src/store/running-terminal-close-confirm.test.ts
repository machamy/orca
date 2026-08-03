import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRunningTerminalCloseConfirmStore } from './running-terminal-close-confirm'

function drainRequests(): void {
  const store = useRunningTerminalCloseConfirmStore.getState()
  while (useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm) {
    store.dismissRunningTerminalClose()
  }
}

function request(terminalTabId: string, onConfirm: () => void = vi.fn(), onCancel?: () => void) {
  return {
    terminalTabId,
    tabLabel: terminalTabId,
    copyKind: 'command' as const,
    onConfirm,
    ...(onCancel ? { onCancel } : {})
  }
}

describe('running terminal close confirmation store', () => {
  afterEach(() => {
    drainRequests()
  })

  it('shows the first request and queues the next one', () => {
    const first = vi.fn()
    const second = vi.fn()
    const store = useRunningTerminalCloseConfirmStore.getState()

    store.requestRunningTerminalCloseConfirm(request('tab-1', first))
    store.requestRunningTerminalCloseConfirm(request('tab-2', second))

    expect(
      useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm?.terminalTabId
    ).toBe('tab-1')

    store.confirmRunningTerminalClose()

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    expect(
      useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm?.terminalTabId
    ).toBe('tab-2')
  })

  it('shows one prompt for a repeat request but still resolves both closes', () => {
    const first = vi.fn()
    const duplicate = vi.fn()
    const store = useRunningTerminalCloseConfirmStore.getState()

    store.requestRunningTerminalCloseConfirm(request('tab-1', first))
    store.requestRunningTerminalCloseConfirm(request('tab-1', duplicate))
    store.confirmRunningTerminalClose()

    expect(first).toHaveBeenCalledTimes(1)
    expect(duplicate).toHaveBeenCalledTimes(1)
    expect(useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm).toBeNull()
  })

  it('cancels both callers when a folded repeat request is dismissed', () => {
    const store = useRunningTerminalCloseConfirmStore.getState()
    const firstCancel = vi.fn()
    const duplicateCancel = vi.fn()

    store.requestRunningTerminalCloseConfirm(request('tab-1', vi.fn(), firstCancel))
    store.requestRunningTerminalCloseConfirm(request('tab-1', vi.fn(), duplicateCancel))
    store.dismissRunningTerminalClose()

    expect(firstCancel).toHaveBeenCalledTimes(1)
    expect(duplicateCancel).toHaveBeenCalledTimes(1)
  })

  it('folds a repeat request into the one already waiting in the queue', () => {
    const store = useRunningTerminalCloseConfirmStore.getState()
    const queued = vi.fn()
    const duplicate = vi.fn()

    store.requestRunningTerminalCloseConfirm(request('tab-1'))
    store.requestRunningTerminalCloseConfirm(request('tab-2', queued))
    store.requestRunningTerminalCloseConfirm(request('tab-2', duplicate))

    store.confirmRunningTerminalClose()
    store.confirmRunningTerminalClose()

    expect(queued).toHaveBeenCalledTimes(1)
    expect(duplicate).toHaveBeenCalledTimes(1)
    expect(useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm).toBeNull()
  })

  it('confirms every pending request once the user opts out of the prompt', () => {
    const store = useRunningTerminalCloseConfirmStore.getState()
    const visible = vi.fn()
    const queued = vi.fn()

    store.requestRunningTerminalCloseConfirm(request('tab-1', visible))
    store.requestRunningTerminalCloseConfirm(request('tab-2', queued))
    store.confirmAllRunningTerminalCloses()

    expect(visible).toHaveBeenCalledTimes(1)
    expect(queued).toHaveBeenCalledTimes(1)
    expect(useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm).toBeNull()
  })

  it('runs onCancel on dismiss and never the close', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const store = useRunningTerminalCloseConfirmStore.getState()

    store.requestRunningTerminalCloseConfirm(request('tab-1', onConfirm, onCancel))
    store.dismissRunningTerminalClose()

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm).toBeNull()
  })

  it('is inert when there is nothing to confirm', () => {
    const store = useRunningTerminalCloseConfirmStore.getState()

    expect(() => store.confirmRunningTerminalClose()).not.toThrow()
    expect(() => store.dismissRunningTerminalClose()).not.toThrow()
  })

  it('lets a re-entrant close from onConfirm queue behind the next request', () => {
    const store = useRunningTerminalCloseConfirmStore.getState()
    const reentrant = vi.fn()
    const second = vi.fn()

    store.requestRunningTerminalCloseConfirm(
      request('tab-1', () => {
        // Why: the real onConfirm re-enters closeTerminalTab, which may request again.
        store.requestRunningTerminalCloseConfirm(request('tab-3', reentrant))
      })
    )
    store.requestRunningTerminalCloseConfirm(request('tab-2', second))
    store.confirmRunningTerminalClose()

    expect(
      useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm?.terminalTabId
    ).toBe('tab-2')

    store.confirmRunningTerminalClose()
    expect(second).toHaveBeenCalledTimes(1)
    expect(
      useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm?.terminalTabId
    ).toBe('tab-3')

    store.confirmRunningTerminalClose()
    expect(reentrant).toHaveBeenCalledTimes(1)
  })
})
