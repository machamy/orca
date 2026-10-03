import { describe, expect, it } from 'vitest'
import { isSleepingSweepExemptWorkspace } from './sidebar/visible-worktrees'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'wt-main',
    repoId: 'repo1',
    path: '/tmp/repo1',
    head: 'abc123',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree: true,
    displayName: 'main',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

describe('Cmd+J empty-query "Hide sleeping" pass (#8873)', () => {
  const repoAt = (path: string): Repo =>
    ({ id: 'repo1', path, displayName: 'r', badgeColor: '#000', addedAt: 0 }) as Repo

  it('exempts the repo-path checkout by default and honours an explicit opt-out', () => {
    const main = makeWorktree()
    const repo = repoAt(main.path)

    expect(isSleepingSweepExemptWorkspace(main, repo, undefined)).toBe(true)
    expect(isSleepingSweepExemptWorkspace(main, repo, true)).toBe(true)
    expect(isSleepingSweepExemptWorkspace(main, repo, false)).toBe(false)
  })

  it('never exempts a non-default-path workspace (e.g. the git main after a switch)', () => {
    const feature = makeWorktree({ id: 'wt-feature', isMainWorktree: true, path: '/tmp/feature' })
    const repo = repoAt('/tmp/repo1')

    expect(isSleepingSweepExemptWorkspace(feature, repo, true)).toBe(false)
    expect(isSleepingSweepExemptWorkspace(feature, repo, undefined)).toBe(false)
  })
})
