import { RuntimeWorkspaceRepoScanRefresh } from './workspaces/workspace-repo-scan-refresh'
import { RuntimeDefaultWorktree } from './orca-runtime-default-worktree'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import { agentHookServer } from '../agent-hooks/server'
import { getRepoIdFromWorktreeId } from '../../shared/worktree/id'
import { hostWorktreeTargetForRepo } from '../persistence/host-qualified-worktree-meta'

/** Fork: promote a sub-worktree to the repo's default checkout. Sits here because
 *  the identity re-key it needs (`notifyWorktreeFolderRenamed`'s ingredients —
 *  tab selections, scan caches, the renderer notifier) all land on this link. */
export abstract class OrcaRuntimeWithDefaultWorktreeCommands extends RuntimeWorkspaceRepoScanRefresh {
  private readonly defaultWorktree = new RuntimeDefaultWorktree({
    resolveWorktree: (selector) => this.resolveGitWorktreeSelector(selector),
    getRepo: (repoId) => this.store?.getRepo(repoId),
    getGitOptions: (repo) => getLocalProjectWorktreeGitOptions(this.requireStore(), repo),
    // Branch swap changes no paths, so a plain refresh updates the branch labels.
    notifyChanged: (repoId) => this.notifyWorktreesChanged(repoId),
    // Follow mode only (both worktrees slept — no live PTYs to rebind): re-key the
    // persisted session content, then have renderers re-key their in-memory state.
    migrateWorktreeIdentity: (oldWorktreeId, newWorktreeId) => {
      const store = this.requireStore()
      if (!store.migrateWorktreeIdentity) {
        throw new Error('default_worktree_switch_identity_store_unavailable')
      }
      const repo = store.getRepo(getRepoIdFromWorktreeId(oldWorktreeId))
      if (!repo) {
        throw new Error('default_worktree_switch_repo_unavailable')
      }
      store.migrateWorktreeIdentity(hostWorktreeTargetForRepo(oldWorktreeId, repo), newWorktreeId)
      this.clientSessionTabSelections.migrateWorktree(oldWorktreeId, newWorktreeId)
      // Why: main's mirrored agent-status rows feed snapshot replays; stale
      // attribution would resurrect chips under the swapped-away worktree.
      agentHookServer.migrateWorktreeAttribution(oldWorktreeId, newWorktreeId)
    },
    notifyIdentitiesChanged: (repoId, migrations) => {
      this.invalidateResolvedWorktreeCache()
      this.invalidateWorktreeScanCacheForRepo(repoId)
      this.notifier?.worktreesChanged(repoId, undefined, { migrations })
      this.emitClientEvent({ type: 'worktreesChanged', repoId })
    }
  })

  setRuntimeDefaultWorktree: RuntimeDefaultWorktree['set'] = this.defaultWorktree.set.bind(
    this.defaultWorktree
  )

  /** CLI/E2E entry for the FULL client switch flow: hand the request to the
   *  desktop renderer, which runs the same sleep -> swap -> wake path as the
   *  sidebar dialog confirm. Async completion — observe via worktree state. */
  async requestUiDefaultWorktreeSwitch(
    selector: string,
    opts: { followAgents: boolean; notifyAgents: boolean; includeUntracked: boolean }
  ): Promise<{ requested: true; repoId: string; worktreeId: string }> {
    const selected = await this.resolveGitWorktreeSelector(selector)
    const repo = this.store?.getRepo(selected.repoId)
    if (!repo || repo.kind === 'folder') {
      throw new Error('default_worktree_switch_git_required')
    }
    if (!this.notifier?.defaultWorktreeSwitchRequest) {
      throw new Error('default_worktree_switch_ui_flow_unavailable')
    }
    this.notifier.defaultWorktreeSwitchRequest(repo.id, selected.id, opts)
    return { requested: true, repoId: repo.id, worktreeId: selected.id }
  }
}
