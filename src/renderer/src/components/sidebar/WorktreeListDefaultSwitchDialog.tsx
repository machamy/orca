import { DefaultWorktreeSwitchDialog } from './DefaultWorktreeSwitchDialog'
import type { useDefaultWorktreeSwitchDialog } from './use-default-worktree-switch-dialog'

/** Fork: confirm dialog for a default-worktree switch requested from a sidebar list card. */
export function WorktreeListDefaultSwitchDialog({
  state
}: {
  state: ReturnType<typeof useDefaultWorktreeSwitchDialog>
}): React.JSX.Element {
  const { defaultSwitchDialogRequest, setDefaultSwitchDialogRequest, confirmDefaultSwitch } = state
  return (
    <DefaultWorktreeSwitchDialog
      key={
        defaultSwitchDialogRequest
          ? `${defaultSwitchDialogRequest.source.id}:${defaultSwitchDialogRequest.currentDefault.id}`
          : 'idle'
      }
      request={defaultSwitchDialogRequest}
      onOpenChange={(open) => {
        if (!open) {
          setDefaultSwitchDialogRequest(null)
        }
      }}
      onConfirm={confirmDefaultSwitch}
    />
  )
}
