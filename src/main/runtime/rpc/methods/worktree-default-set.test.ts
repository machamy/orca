import { describe, expect, it, vi } from 'vitest'
import { WORKTREE_METHODS } from './worktree'

describe('worktree.defaultSet RPC', () => {
  it('routes the selected worktree and defaults the follow/notify flags off', async () => {
    const runtime = {
      setRuntimeDefaultWorktree: vi.fn().mockResolvedValue({ repoId: 'repo-1' })
    }
    const method = WORKTREE_METHODS.find((candidate) => candidate.name === 'worktree.defaultSet')

    expect(method).toBeDefined()
    await expect(
      method?.handler({ worktree: 'active' }, { runtime } as never)
    ).resolves.toMatchObject({ repoId: 'repo-1' })
    expect(runtime.setRuntimeDefaultWorktree).toHaveBeenCalledWith('active', {
      followAgents: false,
      notifyAgents: false,
      includeUntracked: true
    })
  })

  it('refuses a REMOTE follow switch that skipped the sleep/wake flow', async () => {
    const runtime = {
      setRuntimeDefaultWorktree: vi.fn().mockResolvedValue({ repoId: 'repo-1' }),
      requestUiDefaultWorktreeSwitch: vi.fn()
    }
    const method = WORKTREE_METHODS.find((candidate) => candidate.name === 'worktree.defaultSet')

    await expect(
      method?.handler({ worktree: 'active', followAgents: true }, {
        runtime,
        clientKind: 'mobile'
      } as never)
    ).rejects.toThrow('default_worktree_switch_follow_requires_ui_flow')
    // Nothing destructive ran: no branch swap, no identity re-key.
    expect(runtime.setRuntimeDefaultWorktree).not.toHaveBeenCalled()
    expect(runtime.requestUiDefaultWorktreeSwitch).not.toHaveBeenCalled()
  })

  it("accepts the renderer's own mid-flow follow call, which carries no uiFlow", async () => {
    // Exactly what src/renderer/src/lib/default-worktree-switch-client.ts sends
    // after it has slept both worktrees. Requiring uiFlow here killed mode B.
    const runtime = {
      setRuntimeDefaultWorktree: vi.fn().mockResolvedValue({ repoId: 'repo-1' })
    }
    const method = WORKTREE_METHODS.find((candidate) => candidate.name === 'worktree.defaultSet')

    await method?.handler({ worktree: 'id:repo-1::/repo', followAgents: true }, {
      runtime
    } as never)
    expect(runtime.setRuntimeDefaultWorktree).toHaveBeenCalledWith('id:repo-1::/repo', {
      followAgents: true,
      notifyAgents: false,
      includeUntracked: true
    })
  })

  it('forwards follow/notify flags through the UI flow', async () => {
    const runtime = {
      requestUiDefaultWorktreeSwitch: vi
        .fn()
        .mockResolvedValue({ requested: true, repoId: 'repo-1', worktreeId: 'wt-1' })
    }
    const method = WORKTREE_METHODS.find((candidate) => candidate.name === 'worktree.defaultSet')

    await method?.handler(
      { worktree: 'active', followAgents: true, notifyAgents: true, uiFlow: true },
      { runtime } as never
    )
    expect(runtime.requestUiDefaultWorktreeSwitch).toHaveBeenCalledWith('active', {
      followAgents: true,
      notifyAgents: true,
      includeUntracked: true
    })
  })

  it('forwards the opt-out so untracked files stay in their folder', async () => {
    const runtime = {
      setRuntimeDefaultWorktree: vi.fn().mockResolvedValue({ repoId: 'repo-1' })
    }
    const method = WORKTREE_METHODS.find((candidate) => candidate.name === 'worktree.defaultSet')

    await method?.handler({ worktree: 'active', includeUntracked: false }, { runtime } as never)
    expect(runtime.setRuntimeDefaultWorktree).toHaveBeenCalledWith('active', {
      followAgents: false,
      notifyAgents: false,
      includeUntracked: false
    })
  })
})
