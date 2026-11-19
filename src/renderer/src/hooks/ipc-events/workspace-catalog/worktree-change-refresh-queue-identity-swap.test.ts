import { describe, expect, it, vi } from 'vitest'
import { createWorktreeChangeRefreshQueue } from './worktree-change-refresh-queue'

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('createWorktreeChangeRefreshQueue identity swap', () => {
  it('preserves an identity swap as one ordered migration batch', async () => {
    const handler = vi.fn(() => Promise.resolve())
    const queue = createWorktreeChangeRefreshQueue(handler)
    const migrations = [
      { oldWorktreeId: 'feature', newWorktreeId: 'temporary' },
      { oldWorktreeId: 'default', newWorktreeId: 'feature' },
      { oldWorktreeId: 'temporary', newWorktreeId: 'default' }
    ]

    queue.enqueue({ repoId: 'repo-1', migrations })
    await flushPromises()

    expect(handler).toHaveBeenCalledWith(
      'repo-1',
      undefined,
      { forceLocalOwner: undefined },
      migrations
    )
  })
})
