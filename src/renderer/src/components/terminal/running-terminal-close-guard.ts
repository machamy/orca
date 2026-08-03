import { useAppStore } from '@/store'
import { inspectRuntimeTerminalProcess } from '@/runtime/runtime-terminal-inspection'
import { useRunningTerminalCloseConfirmStore } from '@/store/running-terminal-close-confirm'
import type { CloseTerminalDialogCopyKind } from '../terminal-pane/CloseTerminalDialog'
import type { TerminalTabCloseReason } from '@/store/slices/terminal-tab-retirement'
import { isTerminalLeafId, makePaneKey } from '../../../../shared/stable-pane-id'

export type RunningTerminalCloseGuardOptions = {
  force?: boolean
  rejectPinned?: boolean
  reason?: TerminalTabCloseReason
  hostCloseReason?: TerminalTabCloseReason
  lifecyclePtyId?: string
  skipRunningProcessConfirm?: boolean
}

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

/** Picks the dialog copy for the panes that are actually busy. Agent panes win over
 *  plain commands in a split: stopping an agent mid-task is the costlier surprise. */
function resolveBusyCopyKind(
  terminalTabId: string,
  busyPtyIds: readonly string[]
): CloseTerminalDialogCopyKind {
  const state = useAppStore.getState()
  const ptyIdsByLeafId = state.terminalLayoutsByTabId?.[terminalTabId]?.ptyIdsByLeafId ?? {}
  for (const [leafId, ptyId] of Object.entries(ptyIdsByLeafId)) {
    if (!busyPtyIds.includes(ptyId) || !isTerminalLeafId(leafId)) {
      continue
    }
    const agentType = state.agentStatusByPaneKey?.[makePaneKey(terminalTabId, leafId)]?.agentType
    if (agentType && agentType !== 'unknown') {
      return 'agent'
    }
  }
  return 'command'
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
  // drop that already zeroed the map — same blind spot Cmd+W has), and the opt-out setting
  // means the answer is already known. Both keep the close fully synchronous.
  if (ptyIds.length === 0 || settings?.skipCloseTerminalWithRunningProcessConfirm === true) {
    onClose()
    return
  }

  void Promise.allSettled(
    ptyIds.map((ptyId) => inspectRuntimeTerminalProcess(settings, ptyId))
  ).then((results) => {
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
      onClose()
      return
    }
    useRunningTerminalCloseConfirmStore.getState().requestRunningTerminalCloseConfirm({
      terminalTabId,
      tabLabel,
      copyKind: resolveBusyCopyKind(terminalTabId, busyPtyIds),
      onConfirm: onClose,
      ...(onCancel ? { onCancel } : {})
    })
  })
}
