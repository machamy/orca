import { transitionLaunchDrafts } from '@/components/native-chat/drafts/native-chat-launch-draft-transition'
import {
  getRepoExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host/execution-host'
import type { RuntimeWorktreeIdentityMigration } from '../../../../shared/worktree/catalog/runtime-worktree-contracts'
import { useAppStore } from '../../store/index'
import { armWorktreeIdentityGrace } from '../../store/worktree-identity-grace'

function resolveLaunchDraftOwner(
  repoId: string,
  executionHostId: ExecutionHostId | undefined,
  forceLocalOwner: boolean
): ExecutionHostId | undefined {
  if (executionHostId) {
    return executionHostId
  }
  const owners = new Set(
    useAppStore
      .getState()
      .repos.filter(
        (repo) =>
          repo.id === repoId &&
          (!forceLocalOwner || !getRepoExecutionHostId(repo).startsWith('runtime:'))
      )
      .map(getRepoExecutionHostId)
  )
  return owners.size === 1 ? [...owners][0] : undefined
}

/**
 * Re-keys every identity change of one worktrees:changed event in order — a
 * folder rename carries one, a default-worktree swap three chained steps — and
 * returns the id the active worktree ends up under.
 */
export function applyWorktreeIdentityMigrations(args: {
  repoId: string
  migrations: readonly RuntimeWorktreeIdentityMigration[]
  executionHostId?: ExecutionHostId
  forceLocalOwner?: boolean
  activeWorktreeId: string | null
}): string | null {
  let activeWorktreeId = args.activeWorktreeId
  if (args.migrations.length === 0) {
    return activeWorktreeId
  }
  const owner = resolveLaunchDraftOwner(
    args.repoId,
    args.executionHostId,
    args.forceLocalOwner === true
  )
  for (const migration of args.migrations) {
    if (activeWorktreeId === migration.oldWorktreeId) {
      activeWorktreeId = migration.newWorktreeId
    }
    if (owner) {
      transitionLaunchDrafts((source) =>
        source.executionHostId === owner && source.workspaceId === migration.oldWorktreeId
          ? { executionHostId: owner, workspaceId: migration.newWorktreeId }
          : undefined
      )
    }
    // Shield both ids from the deletion diff across the rename's event burst — the worktree list lags the on-disk move.
    armWorktreeIdentityGrace([migration.oldWorktreeId, migration.newWorktreeId])
    useAppStore.getState().migrateWorktreeIdentity(migration.oldWorktreeId, migration.newWorktreeId)
  }
  return activeWorktreeId
}
