/**
 * Fork: keeps each agent pane's model/effort badge current.
 *
 * Polled rather than event-driven because the strongest source is Claude's own
 * TUI frame, which changes with no event Orca can subscribe to. Only Claude
 * panes are serialized — no other agent's screen is parseable, so reading it
 * would cost a full screen dump per tick for nothing.
 */

import { useEffect, useRef, useState } from 'react'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import type { AgentType } from '../../../../shared/agent-status-types'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { useAppStore } from '../../store'
import { readAgentModelBadge, type AgentModelBadgeReading } from './agent-model-badge-reading'

const POLL_INTERVAL_MS = 3000

export type AgentModelBadgeReadings = Readonly<Record<number, AgentModelBadgeReading>>

const EMPTY_READINGS: AgentModelBadgeReadings = Object.freeze({})

function sameReading(
  a: AgentModelBadgeReading | undefined,
  b: AgentModelBadgeReading | undefined
): boolean {
  return (
    a?.modelLabel === b?.modelLabel &&
    a?.effortLabel === b?.effortLabel &&
    a?.observed === b?.observed
  )
}

function sameReadings(a: AgentModelBadgeReadings, b: AgentModelBadgeReadings): boolean {
  const aKeys = Object.keys(a)
  return (
    aKeys.length === Object.keys(b).length &&
    aKeys.every((key) => sameReading(a[Number(key)], b[Number(key)]))
  )
}

export function useAgentModelBadgeReadings(args: {
  tabId: string
  managedPanes: readonly ManagedPane[]
  agentByLeaf: Readonly<Record<string, AgentType>>
  enabled: boolean
}): AgentModelBadgeReadings {
  const { tabId, managedPanes, agentByLeaf, enabled } = args
  const [readings, setReadings] = useState<AgentModelBadgeReadings>(EMPTY_READINGS)
  // Why refs: the poll must see the current panes without restarting its timer
  // on every pane-array identity change, which happens on each layout render.
  const panesRef = useRef(managedPanes)
  const agentByLeafRef = useRef(agentByLeaf)
  panesRef.current = managedPanes
  agentByLeafRef.current = agentByLeaf

  useEffect(() => {
    if (!enabled) {
      setReadings((previous) => (previous === EMPTY_READINGS ? previous : EMPTY_READINGS))
      return
    }
    const sample = (): void => {
      const state = useAppStore.getState()
      const next: Record<number, AgentModelBadgeReading> = {}
      for (const pane of panesRef.current) {
        const agent = agentByLeafRef.current[pane.leafId]
        if (!agent) {
          continue
        }
        const status = state.agentStatusByPaneKey[makePaneKey(tabId, pane.leafId)]
        const reading = readAgentModelBadge({
          agent,
          reportedModel: status?.model,
          reportedEffort: status?.effort,
          screen: agent === 'claude' ? pane.serializeAddon.serialize({ scrollback: 0 }) : null,
          persisted: state.settings?.nativeChatSessionOptions
        })
        if (reading) {
          next[pane.id] = reading
        }
      }
      setReadings((previous) => (sameReadings(previous, next) ? previous : next))
    }
    sample()
    const timer = window.setInterval(sample, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [enabled, tabId])

  return readings
}
