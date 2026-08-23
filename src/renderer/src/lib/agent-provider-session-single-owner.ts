import {
  agentProviderSessionsEqual,
  type AgentProviderSessionMetadata,
  type SleepingAgentSessionRecord
} from '../../../shared/agent-session-resume'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree/id'

/**
 * One provider session must have exactly one owning pane.
 *
 * Observed live: two sleeping records pointed at the same Claude session from
 * DIFFERENT worktrees, and the same conversation opened in two panes. The pair
 * outlives every cleanup because each layer scopes itself to one worktree —
 * `clearSleepingRecordProviderDuplicates` required equal `worktreeId`s, and the
 * claim keys used by wake dedupe embed the worktreeId. That scoping predates
 * the default-worktree switch: back then a session's transcript lived under one
 * cwd, so a same-session record in another worktree could not mean the same
 * conversation. The switch moves transcript trees between paths, which is
 * exactly the invariant that assumption relied on.
 *
 * Everything here is therefore repo-scoped, not worktree-scoped: within a repo
 * the switch may have moved the session anywhere, while another repo's
 * identically-named session (a non-UUID id from some agent) must never be
 * touched.
 */
export function collectProviderSessionDuplicatePaneKeys(
  records: Readonly<Record<string, SleepingAgentSessionRecord>>,
  consumed: { paneKey: string; record: SleepingAgentSessionRecord }
): string[] {
  const consumedRepoId = getRepoIdFromWorktreeId(consumed.record.worktreeId)
  const duplicates: string[] = []
  for (const [paneKey, record] of Object.entries(records)) {
    if (paneKey === consumed.paneKey) {
      continue
    }
    if (
      getRepoIdFromWorktreeId(record.worktreeId) === consumedRepoId &&
      record.agent === consumed.record.agent &&
      agentProviderSessionsEqual(
        record.agent,
        record.providerSession,
        consumed.record.providerSession
      )
    ) {
      duplicates.push(paneKey)
    }
  }
  return duplicates
}

/** A pane currently running an agent, as the reseed needs to see it. */
export type LiveAgentSessionEntry = {
  worktreeId: string | undefined
  agent: string | undefined
  providerSession: AgentProviderSessionMetadata | undefined
  state: string | undefined
}

/**
 * Drops wake-reseed snapshot records whose session already has an owner.
 *
 * The reseed exists to restore records the swap-window churn deleted, but it
 * judged "deleted" by paneKey absence alone — so a record that was legitimately
 * CONSUMED (forked to a new tab, resumed under a new paneKey) was resurrected
 * at its old paneKey, minting the cross-worktree duplicate above.
 */
export function filterReseedableSleepingRecords(
  snapshot: readonly SleepingAgentSessionRecord[],
  existingRecords: Readonly<Record<string, SleepingAgentSessionRecord>>,
  liveEntries: readonly LiveAgentSessionEntry[]
): SleepingAgentSessionRecord[] {
  // The snapshot itself can carry the duplicate pair this module exists to
  // prevent; reseeding both would mint it right back. Newest wins: the fresher
  // record reflects where the session actually last ran, and keeping the first
  // (insertion order = the stale pane) woke agents in their PREVIOUS worktree.
  const ordered = [...snapshot].sort(
    (a, b) => (b.updatedAt ?? b.capturedAt ?? 0) - (a.updatedAt ?? a.capturedAt ?? 0)
  )
  const seeded: SleepingAgentSessionRecord[] = []
  return ordered.filter((record) => {
    const duplicateInSnapshot = seeded.some(
      (kept) =>
        kept.agent === record.agent &&
        getRepoIdFromWorktreeId(kept.worktreeId) === getRepoIdFromWorktreeId(record.worktreeId) &&
        agentProviderSessionsEqual(record.agent, kept.providerSession, record.providerSession)
    )
    if (duplicateInSnapshot) {
      return false
    }
    if (existingRecords[record.paneKey]) {
      return false
    }
    const repoId = getRepoIdFromWorktreeId(record.worktreeId)
    const ownedByRecord = Object.values(existingRecords).some(
      (existing) =>
        existing.agent === record.agent &&
        getRepoIdFromWorktreeId(existing.worktreeId) === repoId &&
        agentProviderSessionsEqual(record.agent, existing.providerSession, record.providerSession)
    )
    if (ownedByRecord) {
      return false
    }
    // A live pane already running the session is ownership too: reseeding its
    // record would hand a second pane a resume ticket for it. Repo-scoped for
    // the same reason as above, and 'done' does not count — a finished row
    // outlives its turn, and treating it as ownership would suppress the very
    // reseed this safety net exists for.
    const ownedByLivePane = liveEntries.some(
      (entry) =>
        entry.agent === record.agent &&
        entry.state !== 'done' &&
        entry.worktreeId !== undefined &&
        getRepoIdFromWorktreeId(entry.worktreeId) === repoId &&
        agentProviderSessionsEqual(record.agent, entry.providerSession, record.providerSession)
    )
    if (ownedByLivePane) {
      return false
    }
    seeded.push(record)
    return true
  })
}

/**
 * In-flight resume claims, keyed WITHOUT the worktreeId.
 *
 * The durable cleanups above cannot stop two panes that both built their resume
 * startup before either one's post-spawn cleanup landed. This closes that last
 * window: the claim is taken synchronously before the spawn, so within one
 * renderer exactly one pane wins.
 */
const inFlightResumeClaims = new Map<string, number>()

/** Generous bound on one resume spawn; a leaked claim must not block forever. */
const RESUME_CLAIM_TTL_MS = 120_000

/**
 * Mirrors `getProviderSessionClaimKey` minus the worktreeId — including the
 * transcript path only where `agentProviderSessionsEqual` does. Keying on it for
 * every agent made two records the other layers call the SAME session claim
 * different keys, so both panes resumed: precisely the case this guards, since
 * the switch is what moves the transcript between paths.
 */
function resumeClaimKey(
  agent: string,
  providerSession: AgentProviderSessionMetadata | undefined
): string {
  const base = `${agent}\0${providerSession?.key ?? ''}\0${providerSession?.id ?? ''}`
  return agent === 'pi' || agent === 'prime-agent'
    ? `${base}\0${providerSession?.transcriptPath ?? ''}`
    : base
}

export function tryClaimAgentSessionResume(
  agent: string,
  providerSession: AgentProviderSessionMetadata | undefined,
  now: number = Date.now()
): boolean {
  const key = resumeClaimKey(agent, providerSession)
  const heldSince = inFlightResumeClaims.get(key)
  if (heldSince !== undefined && now - heldSince < RESUME_CLAIM_TTL_MS) {
    return false
  }
  inFlightResumeClaims.set(key, now)
  return true
}

export function releaseAgentSessionResume(
  agent: string,
  providerSession: AgentProviderSessionMetadata | undefined
): void {
  inFlightResumeClaims.delete(resumeClaimKey(agent, providerSession))
}
