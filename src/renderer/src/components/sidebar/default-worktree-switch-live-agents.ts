import type { AgentStatusEntry } from '../../../../shared/agent-status-types'

/** Agents still mid-turn in either swapped worktree. The swap moves both directories,
 *  so absolute paths these agents cached in their context (edit targets, spawn cwds)
 *  keep pointing at the OTHER checkout afterwards — the user must be warned. */
export function countActiveAgentsForDefaultSwitch(args: {
  agentStatusByPaneKey: Record<string, AgentStatusEntry>
  worktreeIdByTabId: (tabId: string) => string | undefined
  worktreeIds: readonly string[]
}): number {
  const wanted = new Set(args.worktreeIds)
  let count = 0
  for (const entry of Object.values(args.agentStatusByPaneKey)) {
    if (entry.state === 'done') {
      continue
    }
    const tabId = entry.tabId ?? entry.paneKey.split(':')[0]
    const owner = entry.worktreeId ?? (tabId ? args.worktreeIdByTabId(tabId) : undefined)
    if (owner && wanted.has(owner)) {
      count += 1
    }
  }
  return count
}
