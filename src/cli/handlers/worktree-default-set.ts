import type { RuntimeDefaultWorktreeSwitchResult, RuntimeStatus } from '../../shared/runtime-types'
import { DEFAULT_SWITCH_KEEP_UNTRACKED_RUNTIME_CAPABILITY } from '../../shared/protocol-version'
import { RuntimeClientError } from '../runtime-client'
import type { RuntimeRpcSuccess as RuntimeRpcSuccessOf } from '../runtime-client'
import type { CommandHandler } from '../dispatch'
import { formatDefaultWorktreeSwitch, printResult } from '../format'
import { getRequiredWorktreeSelector } from '../selectors'

export const WORKTREE_DEFAULT_SET_HANDLERS: Record<'worktree default set', CommandHandler> = {
  'worktree default set': async ({ flags, client, cwd, json }) => {
    const followAgents = flags.get('follow-agents') === true
    const uiFlow = flags.get('ui-flow') === true
    const keepUntrackedInPlace = flags.get('keep-untracked-in-place') === true
    if (followAgents && !uiFlow) {
      // The host refuses this pairing too; failing here names the missing flag
      // instead of surfacing a raw runtime error code.
      throw new RuntimeClientError(
        'invalid_request',
        '--follow-agents needs --ui-flow: only the desktop app can sleep the agents before the swap and wake them after it. Without it the branches swap while the agents keep running in the old folder.'
      )
    }
    if (keepUntrackedInPlace) {
      // Why assert instead of sending and hoping: a host that predates the flag
      // drops the unknown field and stashes untracked files anyway, moving them
      // to the other worktree — the exact opposite of what was asked, silently.
      // Ignoring this field is destructive, so it needs a capability gate.
      const status = await client.call<RuntimeStatus>('status.get')
      if (!status.result.capabilities?.includes(DEFAULT_SWITCH_KEEP_UNTRACKED_RUNTIME_CAPABILITY)) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This Orca host is too old to honor --keep-untracked-in-place; it would move untracked files with the branch instead. Update the host, or re-run without the flag to accept that behavior.'
        )
      }
    }
    const result = await client.call<
      RuntimeDefaultWorktreeSwitchResult | { requested: true; repoId: string; worktreeId: string }
    >('worktree.defaultSet', {
      worktree: await getRequiredWorktreeSelector(flags, 'worktree', cwd, client),
      ...(followAgents ? { followAgents: true } : {}),
      ...(flags.get('notify-agents') === true ? { notifyAgents: true } : {}),
      ...(uiFlow ? { uiFlow: true } : {}),
      // Only sent when opting out, so older hosts keep their carry-untracked default.
      ...(keepUntrackedInPlace ? { includeUntracked: false } : {})
    })
    const payload = result.result
    if ('requested' in payload && payload.requested) {
      printResult(
        result,
        json,
        () =>
          `Default switch requested via the app UI flow for ${payload.worktreeId}. Completion is asynchronous; verify with worktree list.`
      )
      return
    }
    printResult(
      result as RuntimeRpcSuccessOf<RuntimeDefaultWorktreeSwitchResult>,
      json,
      formatDefaultWorktreeSwitch
    )
  }
}
