// Follow mode ("agents follow their branch") wakes the slept agents only AFTER
// the renderer has re-keyed its state from the switch's identity migrations —
// waking earlier would mount panes under ids that are about to swap owners. The
// switch flow queues the pair (plus which worktree to activate so its agents
// cold-restore in their panes instead of forking to hidden background tabs); the
// worktrees:changed migrations handler consumes it post-migration.
//
// The queue also carries a SNAPSHOT of the sleeping records captured by the
// sleep: state churn during the swap window (list refreshes, purges, exit
// replays) has been observed deleting the fresh records before the wake runs,
// leaving nothing to resume. The consumer re-seeds any snapshot record that
// went missing, re-keyed through the switch's migrations.
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'

const PENDING_WAKE_TTL_MS = 5 * 60_000

type PendingDefaultSwitchWake = {
  worktreeIds: ReadonlySet<string>
  /** Worktree to activate so its followed agents restore in place (usually the
   *  promoted repo-path default the user should now be looking at). */
  activateWorktreeId: string | null
  /** Sleeping records as captured right after the sleep, pre-migration ids. */
  records: readonly SleepingAgentSessionRecord[]
  expiresAt: number
}

let pending: PendingDefaultSwitchWake | null = null

export function queueDefaultSwitchWake(
  worktreeIds: readonly string[],
  activateWorktreeId: string | null = null,
  records: readonly SleepingAgentSessionRecord[] = [],
  now: number = Date.now()
): void {
  pending = {
    worktreeIds: new Set(worktreeIds),
    activateWorktreeId,
    records,
    expiresAt: now + PENDING_WAKE_TTL_MS
  }
}

export function clearDefaultSwitchWake(): void {
  pending = null
}

type WakeMigration = { oldWorktreeId: string; newWorktreeId: string }

/** Apply the switch's identity migrations to one worktree id, in order — the
 *  same sequential re-key the store performed (sel→temp, repo→sel, temp→repo). */
export function remapWorktreeIdThroughMigrations(
  worktreeId: string,
  migrations: readonly WakeMigration[]
): string {
  let current = worktreeId
  for (const migration of migrations) {
    if (current === migration.oldWorktreeId) {
      current = migration.newWorktreeId
    }
  }
  return current
}

export type ConsumedDefaultSwitchWake = {
  worktreeIds: string[]
  activateWorktreeId: string | null
  /** Snapshot records with worktreeId already re-keyed through `migrations`. */
  records: SleepingAgentSessionRecord[]
}

/** Returns the queued pair when `migrations` touches it (and unqueues); empty otherwise. */
export function consumeDefaultSwitchWake(
  migrations: readonly WakeMigration[],
  now: number = Date.now()
): ConsumedDefaultSwitchWake {
  const empty: ConsumedDefaultSwitchWake = {
    worktreeIds: [],
    activateWorktreeId: null,
    records: []
  }
  if (!pending) {
    return empty
  }
  if (pending.expiresAt <= now) {
    pending = null
    return empty
  }
  const queued = pending.worktreeIds
  const touched = migrations.some(
    (migration) => queued.has(migration.oldWorktreeId) || queued.has(migration.newWorktreeId)
  )
  if (!touched) {
    return empty
  }
  const result: ConsumedDefaultSwitchWake = {
    worktreeIds: [...queued],
    activateWorktreeId: pending.activateWorktreeId,
    records: pending.records.map((record) => ({
      ...record,
      worktreeId: remapWorktreeIdThroughMigrations(record.worktreeId, migrations)
    }))
  }
  pending = null
  return result
}
