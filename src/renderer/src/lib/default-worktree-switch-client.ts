import type { RuntimeDefaultWorktreeSwitchResult } from '../../../shared/runtime-types'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'

export function setDefaultWorktree(
  worktreeId: string,
  options?: { followAgents?: boolean; notifyAgents?: boolean; includeUntracked?: boolean }
): Promise<RuntimeDefaultWorktreeSwitchResult> {
  return callRuntimeRpc<RuntimeDefaultWorktreeSwitchResult>(
    { kind: 'local' },
    'worktree.defaultSet',
    {
      worktree: toRuntimeWorktreeSelector(worktreeId),
      ...(options?.followAgents ? { followAgents: true } : {}),
      ...(options?.notifyAgents ? { notifyAgents: true } : {}),
      // Only sent when opting OUT — omitted keeps the host default (carry them).
      ...(options?.includeUntracked === false ? { includeUntracked: false } : {})
    },
    { timeoutMs: 180_000 }
  )
}

/**
 * Confirms both sides of the swap still resolve in the runtime.
 *
 * Why before the sleep: `worktree.defaultSet` resolves its selector on the host,
 * so a row the runtime has already purged — a sub-worktree deleted from disk,
 * whose card the sidebar still renders from persisted state — failed only after
 * the flow had slept every agent on both sides. Observed live: three attempts
 * that each slept five agent sessions and then threw `selector_not_found`.
 */
export async function assertDefaultSwitchWorktreesResolve(
  worktreeIds: readonly string[]
): Promise<void> {
  for (const worktreeId of worktreeIds) {
    await callRuntimeRpc<unknown>(
      { kind: 'local' },
      'worktree.show',
      { worktree: toRuntimeWorktreeSelector(worktreeId) },
      { timeoutMs: 15_000 }
    )
  }
}
