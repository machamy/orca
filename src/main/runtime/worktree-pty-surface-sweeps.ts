/** Sweep provider sessions and local registry independently of the teardown entrypoint to avoid a dependency cycle. */

import type { IPtyProvider } from '../providers/pty-provider-contract'
import { listRegisteredPtys } from '../memory/pty-registry'
import { worktreePtyOwnership } from '../providers/worktree-pty-ownership'
import { mapWithConcurrency } from '../../shared/map-with-concurrency'
import { teardownRpcDeadline } from './worktree-teardown-deadline'

// Bound provider/RPC fanout while allowing normal shutdown requests to coalesce into one process scan.
const WORKTREE_TEARDOWN_CONCURRENCY = 32

export async function sweepProviderByPrefix(
  worktreeId: string,
  provider: IPtyProvider,
  deadline: number,
  stopPty: (
    ptyId: string,
    stop: () => Promise<boolean>
  ) => Promise<{ stopped: boolean; owner: boolean }>,
  onPtyStopped?: (ptyId: string) => void,
  failClosed = false,
  isPtyOwnedByAnotherWorktree?: (ptyId: string, sweptWorktreeId: string) => boolean
): Promise<number> {
  const rpcDeadline = teardownRpcDeadline(deadline)
  const sessions = failClosed
    ? await provider.listProcesses({ deadlineMs: rpcDeadline, worktreeId })
    : await provider.listProcesses({ deadlineMs: rpcDeadline, worktreeId }).catch(() => [])
  const ownsSession = worktreePtyOwnership(worktreeId)
  // A migrated pty matches the swept id only through its frozen spawn-time id.
  const ownedSessions = sessions.filter(
    (session) => ownsSession(session) && !isPtyOwnedByAnotherWorktree?.(session.id, worktreeId)
  )
  // Concurrent starts coalesce shutdown process scans; the bound prevents unbounded fanout.
  const stopped = await mapWithConcurrency(
    ownedSessions,
    WORKTREE_TEARDOWN_CONCURRENCY,
    async (session) => {
      if (Date.now() >= deadline) {
        return 0
      }
      const stopResult = await stopPty(session.id, async () => {
        if (Date.now() >= deadline) {
          return false
        }
        try {
          await provider.shutdown(session.id, { immediate: true, deadlineMs: rpcDeadline })
          return Date.now() < deadline
        } catch {
          return false
        }
      })
      if (stopResult.owner && Date.now() < deadline) {
        clearStoppedPtyState(session.id, onPtyStopped)
        return 1
      }
      return 0
    }
  )
  return stopped.reduce<number>((count, value) => count + value, 0)
}

export async function sweepRegistryForWorktree(
  worktreeId: string,
  localProvider: IPtyProvider,
  deadline: number,
  stopPty: (
    ptyId: string,
    stop: () => Promise<boolean>
  ) => Promise<{ stopped: boolean; owner: boolean }>,
  onPtyStopped?: (ptyId: string) => void,
  isPtyOwnedByAnotherWorktree?: (ptyId: string, sweptWorktreeId: string) => boolean
): Promise<number> {
  const rpcDeadline = teardownRpcDeadline(deadline)
  const entries = listRegisteredPtys().filter(
    (r) => r.worktreeId === worktreeId && !isPtyOwnedByAnotherWorktree?.(r.ptyId, worktreeId)
  )
  const stopped = await mapWithConcurrency(
    entries,
    WORKTREE_TEARDOWN_CONCURRENCY,
    async (entry) => {
      if (Date.now() >= deadline) {
        return 0
      }
      const stopResult = await stopPty(entry.ptyId, async () => {
        if (Date.now() >= deadline) {
          return false
        }
        try {
          await localProvider.shutdown(entry.ptyId, { immediate: true, deadlineMs: rpcDeadline })
          return Date.now() < deadline
        } catch {
          return false
        }
      })
      if (stopResult.owner && Date.now() < deadline) {
        clearStoppedPtyState(entry.ptyId, onPtyStopped)
        return 1
      }
      return 0
    }
  )
  return stopped.reduce<number>((count, value) => count + value, 0)
}

export function clearStoppedPtyState(ptyId: string, onPtyStopped?: (ptyId: string) => void): void {
  try {
    // Daemon shutdown may omit local pty:exit; removal must still drop memory rows.
    onPtyStopped?.(ptyId)
  } catch {
    /* cleanup is best-effort and must not block git-level removal */
  }
}
