import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import type {
  RuntimeDefaultWorktreeSwitchResult,
  RuntimeWorktreeIdentityMigration
} from '../../shared/runtime-types'
import type { GitWorktreeInfo, Worktree } from '../../shared/worktree/types'
import type { Repo } from '../../shared/repo-types'
import { DEFAULT_SWITCH_TEMP_ID_MARKER, WORKTREE_ID_SEPARATOR } from '../../shared/worktree/id'
import { recordCrashBreadcrumb } from '../crash-reporting/crash-breadcrumb-store'
import { swapClaudeProjectTranscripts } from '../claude/claude-project-transcript-swap'
import { switchDefaultWorktree } from '../git/default-worktree-switch'
import type { GitRuntimeOptions } from '../git/git-runtime-options'

type ResolvedDefaultWorktree = Worktree & { git: GitWorktreeInfo }

export type RuntimeDefaultWorktreeSetOptions = {
  /** Follow mode: swap the two workspaces' slept session content + transcripts so
   *  each agent resumes where its branch now lives. Caller must have slept first. */
  followAgents?: boolean
  notifyAgents?: boolean
  /** Carry untracked files with their branch (default). False leaves them where
   *  they are and swaps the branch around them. */
  includeUntracked?: boolean
}

export type RuntimeDefaultWorktreeHost = {
  resolveWorktree(selector: string): Promise<ResolvedDefaultWorktree>
  getRepo(repoId: string): Repo | undefined
  getGitOptions(repo: Repo): GitRuntimeOptions
  /** Refresh worktree branch/HEAD labels after the in-place branch swap. */
  notifyChanged(repoId: string): void
  /** Re-key one worktree id's persisted session state to another (follow mode). */
  migrateWorktreeIdentity(oldWorktreeId: string, newWorktreeId: string): void
  /** Tell renderers to re-key their in-memory session state (follow mode). */
  notifyIdentitiesChanged(
    repoId: string,
    migrations: readonly RuntimeWorktreeIdentityMigration[]
  ): void
}

function samePath(left: string, right: string): boolean {
  return normalizeRuntimePathForComparison(left) === normalizeRuntimePathForComparison(right)
}

function worktreeId(repoId: string, path: string): string {
  return `${repoId}${WORKTREE_ID_SEPARATOR}${path}`
}

/** Three re-key steps that swap two workspaces' session content between their
 *  (stable) ids using a temporary id, so neither side clobbers the other. */
function buildContentSwapMigrations(
  repoId: string,
  defaultPath: string,
  selectedPath: string
): RuntimeWorktreeIdentityMigration[] {
  const defaultId = worktreeId(repoId, defaultPath)
  const selectedId = worktreeId(repoId, selectedPath)
  const temporaryId = worktreeId(
    repoId,
    join(dirname(defaultPath), `${DEFAULT_SWITCH_TEMP_ID_MARKER}${randomUUID()}`)
  )
  return [
    { oldWorktreeId: selectedId, newWorktreeId: temporaryId },
    { oldWorktreeId: defaultId, newWorktreeId: selectedId },
    { oldWorktreeId: temporaryId, newWorktreeId: defaultId }
  ]
}

/**
 * Promote a sub-worktree to the repo's default checkout by swapping the two
 * worktrees' branches IN PLACE (directories untouched, git's main worktree stays
 * at the repo path).
 *
 * Default ("agents stay"): no session migration — worktree ids, PTYs, tabs, and
 * agent sessions stay bound to their paths; the runtime only refreshes labels.
 *
 * Follow mode ("agents follow their branch"): the caller has slept both
 * worktrees; this swaps their persisted session content and Claude transcripts
 * between the two workspaces so each agent resumes where its branch now lives.
 */
export class RuntimeDefaultWorktree {
  constructor(private readonly host: RuntimeDefaultWorktreeHost) {}

  async set(
    selector: string,
    options: RuntimeDefaultWorktreeSetOptions = {}
  ): Promise<RuntimeDefaultWorktreeSwitchResult> {
    const selected = await this.host.resolveWorktree(selector)
    const repo = this.host.getRepo(selected.repoId)
    if (!repo || repo.kind === 'folder') {
      throw new Error('default_worktree_switch_git_required')
    }
    if (repo.connectionId) {
      throw new Error('default_worktree_switch_ssh_unsupported')
    }
    if (samePath(repo.path, selected.path)) {
      throw new Error('default_worktree_switch_already_default')
    }
    if (selected.isBare || selected.git.prunable) {
      throw new Error('default_worktree_switch_selected_not_found')
    }

    const switched = await switchDefaultWorktree({
      defaultPath: repo.path,
      selectedPath: selected.path,
      options: this.host.getGitOptions(repo),
      includeUntracked: options.includeUntracked !== false
    })

    if (options.followAgents) {
      // Swap the two workspaces' slept session content + Claude transcripts, then
      // tell renderers to re-key so their wake resumes each agent at the swapped path.
      const migrations = buildContentSwapMigrations(repo.id, repo.path, selected.path)
      // TEMP mode-B diagnostics: proves main ran the follow path and with which
      // ids, so a missing renderer `mode_b_follow` breadcrumb pins the drop to the
      // event bridge rather than to main.
      recordCrashBreadcrumb('mode_b_follow_main', {
        repoId: repo.id,
        defaultId: migrations[1]?.oldWorktreeId ?? null,
        selectedId: migrations[0]?.oldWorktreeId ?? null,
        migrations: migrations.length
      })
      for (const migration of migrations) {
        this.host.migrateWorktreeIdentity(migration.oldWorktreeId, migration.newWorktreeId)
      }
      try {
        await swapClaudeProjectTranscripts(repo.path, selected.path)
      } catch (error) {
        // The branches are already swapped and the identities re-keyed, so
        // failing the whole call would be worse than continuing. But a silent
        // console.warn made "resume finds no conversation" undiagnosable —
        // leave a breadcrumb naming the failure.
        console.warn('[default-worktree-switch] agent transcript swap failed:', error)
        recordCrashBreadcrumb('mode_b_transcript_swap_failed', {
          repoId: repo.id,
          error: error instanceof Error ? error.message : String(error)
        })
      }
      this.host.notifyIdentitiesChanged(repo.id, migrations)
    } else {
      this.host.notifyChanged(repo.id)
    }

    return {
      repoId: repo.id,
      defaultPath: switched.defaultPath,
      selectedPath: switched.selectedPath,
      promotedBranch: switched.promotedBranch,
      demotedBranch: switched.demotedBranch,
      // Why forwarded: a checkout that warned kept the rescue refs holding the
      // only complete copy of the captured work, and the UI names them. Dropped
      // here, that warning never reached anyone.
      ...(switched.checkoutWarnings ? { checkoutWarnings: switched.checkoutWarnings } : {}),
      ...(switched.retainedRescueRefs ? { retainedRescueRefs: switched.retainedRescueRefs } : {})
    }
  }
}
