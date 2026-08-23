import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../dispatch'
import type { RuntimeClient } from '../runtime-client'
import { WORKTREE_DEFAULT_SET_HANDLERS } from './worktree-default-set'

describe('worktree default set CLI handler', () => {
  afterEach(() => vi.restoreAllMocks())

  it('routes the normalized worktree selector', async () => {
    const call = vi.fn().mockResolvedValue({
      result: {
        repoId: 'repo-1',
        defaultPath: '/repo',
        selectedOldPath: '/feature',
        selectedWorktreeId: 'repo-1::/repo',
        displacedWorktreeId: 'repo-1::/feature',
        gitMainPath: '/feature'
      }
    })
    const context: HandlerContext = {
      flags: new Map([['worktree', 'id:repo-1::/feature']]),
      client: { call } as unknown as RuntimeClient,
      cwd: '/repo',
      json: true,
      rawArgs: []
    }
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await WORKTREE_DEFAULT_SET_HANDLERS['worktree default set'](context)

    expect(call).toHaveBeenCalledWith('worktree.defaultSet', {
      worktree: 'id:repo-1::/feature'
    })
  })
})
