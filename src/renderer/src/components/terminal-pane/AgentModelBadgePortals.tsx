/**
 * Fork: mounts one model/effort badge into each agent pane's own container, so a
 * split showing Claude beside Codex names both rather than only the focused one.
 */

import { useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../../store'
import {
  resolveAgentModelBadgeSettings,
  type AgentModelBadgeCorner
} from '../../../../shared/agent-model-badge-settings'
import { AgentModelBadge } from './AgentModelBadge'
import { useAgentModelBadgeReadings } from './use-agent-model-badge-readings'
import type { TerminalPaneController } from './use-terminal-pane-controller'

export function AgentModelBadgePortals({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element | null {
  const { isVisible, managedPanes, tabAgentTypeByLeaf, tabId } = controller
  const stored = useAppStore((state) => state.settings?.agentModelBadge)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const badge = resolveAgentModelBadgeSettings(stored)
  const readings = useAgentModelBadgeReadings({
    tabId,
    managedPanes,
    agentByLeaf: tabAgentTypeByLeaf,
    enabled: badge.enabled && isVisible
  })

  const moveToCorner = useCallback(
    (corner: AgentModelBadgeCorner) => {
      void updateSettings({ agentModelBadge: { enabled: true, corner } })
    },
    [updateSettings]
  )
  const hide = useCallback(() => {
    void updateSettings({ agentModelBadge: { enabled: false, corner: badge.corner } })
  }, [badge.corner, updateSettings])

  if (!badge.enabled || !isVisible) {
    return null
  }

  return (
    <>
      {managedPanes.map((pane) => {
        const reading = readings[pane.id]
        if (!reading) {
          return null
        }
        return createPortal(
          <AgentModelBadge
            reading={reading}
            corner={badge.corner}
            onMoveToCorner={moveToCorner}
            onHide={hide}
          />,
          pane.container,
          `agent-model-badge-${pane.id}`
        )
      })}
    </>
  )
}
