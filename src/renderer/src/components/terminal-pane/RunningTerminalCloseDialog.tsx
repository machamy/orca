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
  const dismissClose = useRunningTerminalCloseConfirmStore(
    (state) => state.dismissRunningTerminalClose
  )
  const updateSettings = useAppStore((state) => state.updateSettings)

  return (
    <CloseTerminalDialog
      open={request !== null}
      copyKind={request?.copyKind ?? 'command'}
      {...(request?.tabLabel ? { tabLabel: request.tabLabel } : {})}
      onCancel={dismissClose}
      onConfirm={(dontAskAgain) => {
        if (dontAskAgain) {
          void updateSettings({ skipCloseTerminalWithRunningProcessConfirm: true })
        }
        confirmClose()
      }}
    />
  )
}
