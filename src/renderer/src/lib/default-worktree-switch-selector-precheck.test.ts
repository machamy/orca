import { beforeEach, describe, expect, it, vi } from 'vitest'

const callRuntimeRpc = vi.fn()
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc }))
vi.mock('@/runtime/runtime-worktree-selector', () => ({
  toRuntimeWorktreeSelector: (id: string) => ({ id })
}))

/**
 * Observed live: a sub-worktree deleted from disk stayed on its sidebar card,
 * and switching to it slept every agent on both sides before the host rejected
 * the selector — three attempts, five sleeping sessions each, and a
 * `selector_not_found` that only ever arrived after the damage.
 */
describe('assertDefaultSwitchWorktreesResolve', () => {
  beforeEach(() => {
    callRuntimeRpc.mockReset()
  })

  it('checks every worktree the switch is about to sleep', async () => {
    callRuntimeRpc.mockResolvedValue({ worktree: {} })
    const { assertDefaultSwitchWorktreesResolve } = await import('./default-worktree-switch-client')

    await assertDefaultSwitchWorktreesResolve(['repo::/a', 'repo::/b'])

    expect(callRuntimeRpc).toHaveBeenCalledTimes(2)
    expect(callRuntimeRpc.mock.calls.map((call) => call[1])).toEqual([
      'worktree.show',
      'worktree.show'
    ])
  })

  it('surfaces the host rejection instead of reporting success', async () => {
    callRuntimeRpc.mockRejectedValueOnce(new Error('selector_not_found'))
    const { assertDefaultSwitchWorktreesResolve } = await import('./default-worktree-switch-client')

    await expect(assertDefaultSwitchWorktreesResolve(['repo::/gone'])).rejects.toThrow(
      'selector_not_found'
    )
  })
})
