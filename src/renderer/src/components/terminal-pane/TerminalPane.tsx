import { TerminalPaneSurface } from './controller/TerminalPaneSurface'
import { AgentModelBadgePortals } from './agent-model-badge/AgentModelBadgePortals'
import { TerminalRestoringPlaceholder } from './mounting/TerminalRestoringPlaceholder'
import { useTerminalPaneController } from './controller/use-terminal-pane-controller'
import { useHostTerminalScrollbackHold } from './snapshots/use-host-terminal-scrollback-hold'
import type { TerminalPaneProps } from './controller/terminal-pane-types'

function MountedTerminalPane(props: TerminalPaneProps): React.JSX.Element {
  const controller = useTerminalPaneController(props)
  // Mounted beside the surface because the surface file is at its line budget.
  return (
    <>
      <TerminalPaneSurface controller={controller} />
      <AgentModelBadgePortals controller={controller} />
    </>
  )
}

export default function TerminalPane(props: TerminalPaneProps): React.JSX.Element {
  const holdForHostScrollback = useHostTerminalScrollbackHold(props.tabId, props.worktreeId)
  return holdForHostScrollback ? (
    <TerminalRestoringPlaceholder />
  ) : (
    <MountedTerminalPane {...props} />
  )
}
