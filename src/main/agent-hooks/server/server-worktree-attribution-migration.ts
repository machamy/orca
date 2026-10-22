import { admitLegacyAgentStatus } from '../../../shared/agent-hook-listener/listener-state'
import { AGENT_STATUS_2A_CURRENT_PRODUCER_MODE } from '../../../shared/agent-status-legacy-adapter'
import type { EnrichedAgentHookEventPayload } from './server-types'
import { AgentHookServerCleanup } from './server-cleanup'

/** Fork: its own link so the default-worktree switch adds no lines to upstream's cleanup. */
export abstract class AgentHookServerWorktreeAttributionMigration extends AgentHookServerCleanup {
  /** Fork (default-worktree switch, follow mode): re-key mirrored status rows from one
   *  worktree id to another so snapshot replays don't resurrect chips under the
   *  swapped-away worktree. */
  migrateWorktreeAttribution(oldWorktreeId: string, newWorktreeId: string): void {
    if (oldWorktreeId === newWorktreeId) {
      return
    }
    let changed = false
    for (const [, rawEntry] of this.state.lastStatusByPaneKey) {
      const entry = rawEntry as EnrichedAgentHookEventPayload
      if (entry.worktreeId === oldWorktreeId) {
        // Fork: the cache is a read-only view now; writes go through the legacy adapter.
        admitLegacyAgentStatus(
          this.state,
          'main-status-cleanup',
          { ...entry, worktreeId: newWorktreeId },
          AGENT_STATUS_2A_CURRENT_PRODUCER_MODE
        )
        changed = true
      }
    }
    if (changed) {
      this.scheduleStatusPersist()
      this.notifyStatusChangeListeners()
    }
  }
}
