import type { IPtyProvider } from '../providers/types'
import { listRegisteredPtys } from '../memory/pty-registry'
import { mapWithConcurrency } from '../../shared/map-with-concurrency'

// Why: normal inventories still coalesce into one process scan, while a stale
// or pathological inventory cannot fan out unbounded provider/RPC shutdowns.
export const WORKTREE_TEARDOWN_CONCURRENCY = 32

export function clearStoppedPtyState(ptyId: string, onPtyStopped?: (ptyId: string) => void): void {
  if (!onPtyStopped) {
    return
  }
  try {
    // Why: daemon shutdown does not always fan a local pty:exit event back
    // through pty.ts, but removed worktrees must immediately drop memory rows.
    onPtyStopped(ptyId)
  } catch {
    /* cleanup is best-effort and must not block git-level removal */
  }
}

/** Kills local pty-registry rows registered under `worktreeId` — the fallback
 *  provider surface and canonical memory-attribution source (see
 *  killAllProcessesForWorktree in worktree-teardown.ts for the sweep contract). */
export async function sweepRegistryForWorktree(
  worktreeId: string,
  localProvider: IPtyProvider,
  deadline: number,
  rpcDeadline: number,
  stopPty: (
    ptyId: string,
    stop: () => Promise<boolean>
  ) => Promise<{ stopped: boolean; owner: boolean }>,
  onPtyStopped?: (ptyId: string) => void,
  isPtyOwnedByAnotherWorktree?: (ptyId: string, sweptWorktreeId: string) => boolean
): Promise<number> {
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
