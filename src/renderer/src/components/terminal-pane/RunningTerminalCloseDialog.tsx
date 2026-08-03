import { useRef } from 'react'
import { useAppStore } from '@/store'
import { useRunningTerminalCloseConfirmStore } from '@/store/running-terminal-close-confirm'
import CloseTerminalDialog from './CloseTerminalDialog'

/** Hosts the running-process close confirmation for tab-level closes (tab-strip X,
 *  middle-click, tab menu, tab groups, floating panel) so they share the prompt Cmd+W
 *  already raised. Store-driven, like PinnedTabCloseDialog, because those closes run
 *  outside any pane's React tree. */
export default function RunningTerminalCloseDialog(): React.JSX.Element {
  const request = useRunningTerminalCloseConfirmStore((state) => state.runningTerminalCloseConfirm)
  const confirmClose = useRunningTerminalCloseConfirmStore(
    (state) => state.confirmRunningTerminalClose
  )
  const confirmAllCloses = useRunningTerminalCloseConfirmStore(
    (state) => state.confirmAllRunningTerminalCloses
  )
  const dismissClose = useRunningTerminalCloseConfirmStore(
    (state) => state.dismissRunningTerminalClose
  )
  const updateSettings = useAppStore((state) => state.updateSettings)
  // Why: this queue is async (it opens after a probe) while the pinned queue is synchronous,
  // so both can be pending at once. Wait rather than stack two modal overlays and focus traps.
  const pinnedRequest = useAppStore((state) => state.pinnedTabCloseConfirm)

  // Why: a queued request reuses the open dialog, so remount on tab change to clear the
  // previous tab's "don't ask again" tick. Held across close so the exit animation keeps
  // the same element.
  const dialogKeyRef = useRef('idle')
  if (request) {
    dialogKeyRef.current = request.terminalTabId
  }

  return (
    <CloseTerminalDialog
      key={dialogKeyRef.current}
      open={request !== null && pinnedRequest === null}
      copyKind={request?.copyKind ?? 'command'}
      {...(request?.tabLabel ? { tabLabel: request.tabLabel } : {})}
      onCancel={dismissClose}
      onConfirm={(dontAskAgain) => {
        if (dontAskAgain) {
          void updateSettings({ skipCloseTerminalWithRunningProcessConfirm: true })
          // Why: the user just opted out of this prompt; a queued one must not still appear.
          confirmAllCloses()
          return
        }
        confirmClose()
      }}
    />
  )
}
