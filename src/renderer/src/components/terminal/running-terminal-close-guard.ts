import { useAppStore } from '@/store'
import { inspectRuntimeTerminalProcess } from '@/runtime/runtime-terminal-inspection'
import { useRunningTerminalCloseConfirmStore } from '@/store/running-terminal-close-confirm'
import type { TerminalTabCloseReason } from '@/store/slices/terminal-tab-retirement'
import { resolveBusyPtyCloseCopyKind } from './terminal-close-copy-kind'

export type RunningTerminalCloseGuardOptions = {
  force?: boolean
  rejectPinned?: boolean
  reason?: TerminalTabCloseReason
  hostCloseReason?: TerminalTabCloseReason
  lifecyclePtyId?: string
  skipRunningProcessConfirm?: boolean
}

/** Upper bound on how long a close may wait on the probe before it just closes. A remote
 *  inspect RPC can hang for its full 15s timeout, and an X button that looks dead for 15s
 *  is the same class of bug as one that never asks. Every close path shares this guard,
 *  so keyboard and mouse still behave identically (#10142). */
export const RUNNING_CLOSE_PROBE_TIMEOUT_MS = 4_000

/** Whether this close is an interactive user action that should stop and ask before
 *  killing a live child process. Lifecycle echoes, bulk closes, CLI/RPC closes and the
 *  post-confirmation re-entry are all excluded. */
export function shouldConfirmRunningTerminalClose(
  options?: RunningTerminalCloseGuardOptions
): boolean {
  if (options?.force === true || options?.rejectPinned === true) {
    return false
  }
  if (options?.skipRunningProcessConfirm === true || options?.lifecyclePtyId !== undefined) {
    return false
  }
  const isUserReason = (reason: TerminalTabCloseReason | undefined): boolean =>
    reason === undefined || reason === 'user'
  return isUserReason(options?.reason) && isUserReason(options?.hostCloseReason)
}

/**
 * Routes an interactive terminal-tab close through the running-process confirmation.
 * Closes immediately when nothing is running, so idle tabs keep today's behavior.
 */
export function guardRunningTerminalClose(params: {
  terminalTabId: string
  tabLabel: string
  onClose: () => void
  onCancel?: () => void
}): void {
  const { terminalTabId, tabLabel, onClose, onCancel } = params
  const state = useAppStore.getState()
  const settings = state.settings
  const ptyIds = state.ptyIdsByTabId?.[terminalTabId] ?? []
  // Why: no live PTY id means there is nothing to probe (parked/hibernated tab, or an SSH
  // drop that already zeroed the map), and the opt-out setting means the answer is already
  // known. Both keep the close fully synchronous.
  if (ptyIds.length === 0 || settings?.skipCloseTerminalWithRunningProcessConfirm === true) {
    onClose()
    return
  }

  // Why: the timeout, the probe result and the error path can all reach the close, so make
  // it idempotent instead of trusting those races to stay mutually exclusive.
  let closeInvoked = false
  const closeOnce = (): void => {
    if (closeInvoked) {
      return
    }
    closeInvoked = true
    onClose()
  }
  const probeTimeout = setTimeout(closeOnce, RUNNING_CLOSE_PROBE_TIMEOUT_MS)

  void Promise.allSettled(ptyIds.map((ptyId) => inspectRuntimeTerminalProcess(settings, ptyId)))
    .then((results) => {
      clearTimeout(probeTimeout)
      if (closeInvoked) {
        return
      }
      // Why: fail open, matching the Cmd+W pane path — a rejected probe (wedged relay,
      // legacy provider) or a stale remote handle is not evidence of a live child, and a
      // close button that silently does nothing is worse than closing a busy tab.
      const busyPtyIds = ptyIds.filter((_, index) => {
        const result = results[index]
        return (
          result?.status === 'fulfilled' &&
          result.value.hasChildProcesses &&
          result.value.unavailable !== true
        )
      })
      if (busyPtyIds.length === 0) {
        closeOnce()
        return
      }
      useRunningTerminalCloseConfirmStore.getState().requestRunningTerminalCloseConfirm({
        terminalTabId,
        tabLabel,
        copyKind: resolveBusyPtyCloseCopyKind(terminalTabId, busyPtyIds),
        onConfirm: closeOnce,
        ...(onCancel ? { onCancel } : {})
      })
    })
    // Why: allSettled never rejects, so this only fires when the decision above throws (a
    // copy-kind lookup, a store subscriber). Without it the tab would silently never close
    // and the user would get no feedback at all; the pane path it replaced had this catch.
    .catch(() => {
      clearTimeout(probeTimeout)
      closeOnce()
    })
}
