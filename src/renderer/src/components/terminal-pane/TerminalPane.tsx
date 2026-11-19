import { TerminalPaneSurface } from './controller/TerminalPaneSurface'
import { AgentModelBadgePortals } from './agent-model-badge/AgentModelBadgePortals'
import { useTerminalPaneController } from './controller/use-terminal-pane-controller'
import type { TerminalPaneProps } from './controller/terminal-pane-types'

export default function TerminalPane(props: TerminalPaneProps): React.JSX.Element {
  const controller = useTerminalPaneController(props)
  // Mounted beside the surface because the surface file is at its line budget.
  return (
    <>
      <TerminalPaneSurface controller={controller} />
      <AgentModelBadgePortals controller={controller} />
    </>
  )
}
