import type { AgentStatusState } from '../../shared/agent-status-types'

/** Just the projected fields, declared locally because the server's enriched hook
 *  payload type is module-private. */
export type HookStatusSessionTabsRow = {
  paneKey: string
  state: AgentStatusState
  connectionId?: string | null
  providerSessionOnly?: boolean
  agentType?: string
  prompt?: string
  toolName?: string
  interactivePrompt?: string
  interrupted?: boolean
}

type ProjectedStatus = {
  state: AgentStatusState
  connectionId: string | null
  agentType: string | null
  prompt: string
  toolName: string | null
  interactivePrompt: string | null
  interrupted: boolean
}

function project(row: HookStatusSessionTabsRow): ProjectedStatus {
  return {
    state: row.state,
    connectionId: row.connectionId ?? null,
    agentType: row.agentType ?? null,
    prompt: row.prompt ?? '',
    toolName: row.toolName ?? null,
    interactivePrompt: row.interactivePrompt ?? null,
    interrupted: row.interrupted ?? false
  }
}

/** Reports whether a hook status event changed anything the `session.tabs`
 *  projection publishes, so a repeated same-state ping costs no snapshot rebuild.
 *  Mirrors the retained-OSC change set so both carriers invalidate alike. */
export function createHookStatusSessionTabsInvalidator(): {
  (row: HookStatusSessionTabsRow): boolean
  forgetPane: (paneKey: string) => void
  forgetConnection: (connectionId: string) => string[]
} {
  const known = new Map<string, ProjectedStatus>()
  const invalidator = (row: HookStatusSessionTabsRow): boolean => {
    // Why: resume-identity rows carry transport placeholders, not status; the
    // provider-session invalidator owns their republish.
    if (row.providerSessionOnly === true) {
      return false
    }
    const next = project(row)
    const previous = known.get(row.paneKey)
    known.set(row.paneKey, next)
    return (
      !previous ||
      previous.state !== next.state ||
      previous.agentType !== next.agentType ||
      previous.prompt !== next.prompt ||
      previous.toolName !== next.toolName ||
      previous.interactivePrompt !== next.interactivePrompt ||
      previous.interrupted !== next.interrupted
    )
  }
  // Why: a cleared pane must re-arm, else the memo swallows the first event of the
  // next agent when it happens to match the one that just went away.
  invalidator.forgetPane = (paneKey: string): void => {
    known.delete(paneKey)
  }
  // Why: an SSH disconnect clears a whole host's rows at once and names no pane, so
  // the caller needs the pane list back to republish each affected workspace.
  invalidator.forgetConnection = (connectionId: string): string[] => {
    const forgotten: string[] = []
    for (const [paneKey, status] of known) {
      if (status.connectionId === connectionId) {
        known.delete(paneKey)
        forgotten.push(paneKey)
      }
    }
    return forgotten
  }
  return invalidator
}
