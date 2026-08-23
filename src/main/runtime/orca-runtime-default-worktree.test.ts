import { beforeEach, describe, expect, it, vi } from 'vitest'

const git = vi.hoisted(() => ({ switchDefault: vi.fn() }))

vi.mock('../git/default-worktree-switch', () => ({
  switchDefaultWorktree: git.switchDefault
}))

import { RuntimeDefaultWorktree } from './orca-runtime-default-worktree'
import type { RuntimeDefaultWorktreeHost } from './orca-runtime-default-worktree'
import type { GitWorktreeInfo, Worktree } from '../../shared/worktree/types'
import type { Repo } from '../../shared/repo-types'

type ResolvedWorktree = Worktree & { git: GitWorktreeInfo }

const repo = {
  id: 'repo-1',
  path: '/repo',
  displayName: 'repo',
  badgeColor: 'gray',
  addedAt: 1,
  kind: 'git'
} as Repo
const target = {
  id: 'repo-1::/feature',
  repoId: 'repo-1',
  path: '/feature',
  head: 'target-head',
  isMainWorktree: false,
  isBare: false,
  git: {
    path: '/feature',
    head: 'target-head',
    branch: 'refs/heads/feature',
    isMainWorktree: false
  }
} as ResolvedWorktree

function makeHost(overrides: Partial<RuntimeDefaultWorktreeHost> = {}) {
  return {
    resolveWorktree: vi.fn().mockResolvedValue(target),
    getRepo: vi.fn().mockReturnValue(repo),
    getGitOptions: vi.fn().mockReturnValue({}),
    notifyChanged: vi.fn(),
    migrateWorktreeIdentity: vi.fn(),
    notifyIdentitiesChanged: vi.fn(),
    ...overrides
  } satisfies RuntimeDefaultWorktreeHost
}

describe('runtime default worktree switch', () => {
  beforeEach(() => {
    git.switchDefault.mockReset().mockResolvedValue({
      defaultPath: '/repo',
      selectedPath: '/feature',
      promotedBranch: 'feature',
      demotedBranch: 'main'
    })
  })

  it('swaps branches in place and refreshes, migrating no paths or ids', async () => {
    const host = makeHost()

    await expect(new RuntimeDefaultWorktree(host).set(`id:${target.id}`)).resolves.toEqual({
      repoId: 'repo-1',
      defaultPath: '/repo',
      selectedPath: '/feature',
      promotedBranch: 'feature',
      demotedBranch: 'main'
    })
    expect(git.switchDefault).toHaveBeenCalledWith({
      defaultPath: '/repo',
      selectedPath: '/feature',
      options: {},
      includeUntracked: true
    })
    // Paths never move, so the runtime only refreshes branch labels.
    expect(host.notifyChanged).toHaveBeenCalledWith('repo-1')
  })

  it('follow mode swaps session content between the two workspaces and re-keys renderers', async () => {
    const host = makeHost()

    await new RuntimeDefaultWorktree(host).set(`id:${target.id}`, { followAgents: true })

    // 3-step content swap between repo-1::/repo and repo-1::/feature via a temp id.
    const migrations = vi.mocked(host.migrateWorktreeIdentity).mock.calls
    expect(migrations).toHaveLength(3)
    expect(migrations[0]).toEqual([target.id, expect.stringContaining('.orca-default-switch-')])
    expect(migrations[1]).toEqual(['repo-1::/repo', target.id])
    expect(migrations[2]).toEqual([migrations[0]?.[1], 'repo-1::/repo'])
    const notified = vi.mocked(host.notifyIdentitiesChanged).mock.calls[0]
    expect(notified?.[0]).toBe('repo-1')
    expect(notified?.[1].map((m) => [m.oldWorktreeId, m.newWorktreeId])).toEqual(migrations)
    // Plain refresh path is NOT used in follow mode.
    expect(host.notifyChanged).not.toHaveBeenCalled()
  })

  it('default mode does no session migration — just a plain refresh', async () => {
    const host = makeHost()

    await new RuntimeDefaultWorktree(host).set(`id:${target.id}`)

    expect(host.migrateWorktreeIdentity).not.toHaveBeenCalled()
    expect(host.notifyIdentitiesChanged).not.toHaveBeenCalled()
    expect(host.notifyChanged).toHaveBeenCalledWith('repo-1')
  })

  it('refreshes only after a successful swap', async () => {
    const host = makeHost()
    git.switchDefault.mockRejectedValue(new Error('default_worktree_switch_recovery_required'))

    await expect(new RuntimeDefaultWorktree(host).set(`id:${target.id}`)).rejects.toThrow(
      'default_worktree_switch_recovery_required'
    )
    expect(host.notifyChanged).not.toHaveBeenCalled()
  })

  it('degrades safely for direct SSH repos', async () => {
    const host = makeHost({ getRepo: vi.fn().mockReturnValue({ ...repo, connectionId: 'ssh-1' }) })

    await expect(new RuntimeDefaultWorktree(host).set(`id:${target.id}`)).rejects.toThrow(
      'default_worktree_switch_ssh_unsupported'
    )
    expect(git.switchDefault).not.toHaveBeenCalled()
  })

  it('degrades safely for folder workspaces', async () => {
    const host = makeHost({ getRepo: vi.fn().mockReturnValue({ ...repo, kind: 'folder' }) })

    await expect(new RuntimeDefaultWorktree(host).set(`id:${target.id}`)).rejects.toThrow(
      'default_worktree_switch_git_required'
    )
  })

  it('rejects promoting the current default onto itself', async () => {
    const host = makeHost({
      resolveWorktree: vi.fn().mockResolvedValue({ ...target, path: '/repo' })
    })

    await expect(new RuntimeDefaultWorktree(host).set('id:repo-1::/repo')).rejects.toThrow(
      'default_worktree_switch_already_default'
    )
    expect(git.switchDefault).not.toHaveBeenCalled()
  })
})
