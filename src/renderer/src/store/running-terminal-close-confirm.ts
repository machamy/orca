import { create } from 'zustand'
import type { CloseTerminalDialogCopyKind } from '@/components/terminal-pane/CloseTerminalDialog'

/** A pending confirmation for closing a terminal tab whose shell still has a
 *  running child process. `onConfirm` performs the original close. */
export type RunningTerminalCloseConfirmRequest = {
  terminalTabId: string
  tabLabel: string
  copyKind: CloseTerminalDialogCopyKind
  onConfirm: () => void
  onCancel?: () => void
}

export type RunningTerminalCloseConfirmState = {
  runningTerminalCloseConfirm: RunningTerminalCloseConfirmRequest | null
  requestRunningTerminalCloseConfirm: (request: RunningTerminalCloseConfirmRequest) => void
  confirmRunningTerminalClose: () => void
  dismissRunningTerminalClose: () => void
}

// Why a standalone store instead of an AppState slice (which is what the sibling
// pinned-tab confirmation uses): the request is raised from closeTerminalTab, a plain
// module whose unit fixtures build partial app-state objects, so dispatching through
// useAppStore.getState() would throw there. Nothing outside the dialog reads this state,
// so the AppState coupling would buy nothing.
export const useRunningTerminalCloseConfirmStore = create<RunningTerminalCloseConfirmState>()((
  set,
  get
) => {
  const queuedRequests: RunningTerminalCloseConfirmRequest[] = []

  const advanceRequest = (): void => {
    set({ runningTerminalCloseConfirm: queuedRequests.shift() ?? null })
  }

  return {
    runningTerminalCloseConfirm: null,

    requestRunningTerminalCloseConfirm: (request) => {
      const visible = get().runningTerminalCloseConfirm
      // Why: the probe is async, so a second click on the same tab arrives before the
      // dialog opens; without this it would stack a second identical prompt.
      if (
        visible?.terminalTabId === request.terminalTabId ||
        queuedRequests.some((queued) => queued.terminalTabId === request.terminalTabId)
      ) {
        return
      }
      if (visible) {
        // Why: closing two busy tabs in quick succession must not strand the second
        // tab's close callback behind a replaced request.
        queuedRequests.push(request)
        return
      }
      set({ runningTerminalCloseConfirm: request })
    },

    confirmRunningTerminalClose: () => {
      const request = get().runningTerminalCloseConfirm
      if (!request) {
        return
      }
      // Why: advance before running onConfirm so a re-entrant close queues behind the
      // next real request instead of seeing the stale one.
      advanceRequest()
      request.onConfirm()
    },

    dismissRunningTerminalClose: () => {
      const request = get().runningTerminalCloseConfirm
      if (!request) {
        return
      }
      advanceRequest()
      // Why: callers such as the tab-group model resume their own cleanup on cancel.
      request.onCancel?.()
    }
  }
})
