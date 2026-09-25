import { MonitorUp } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { WorktreeContextMenuModel } from './use-worktree-context-menu-model'

/** Fork: entry point for the default-worktree switch; absent when the list offers no switch. */
export function DefaultWorktreeSwitchMenuItem({
  model,
  disabled
}: {
  model: WorktreeContextMenuModel
  disabled: boolean
}): React.JSX.Element | null {
  if (!model.onDefaultSwitchRequest) {
    return null
  }
  return (
    <DropdownMenuItem onSelect={model.handleDefaultSwitch} disabled={disabled}>
      <MonitorUp className="size-3.5" />
      {translate(
        'auto.components.sidebar.WorktreeContextMenu.defaultSwitch',
        'Make Default Worktree…'
      )}
    </DropdownMenuItem>
  )
}
