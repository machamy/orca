import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { orderDefaultCheckoutFirst } from './section-order'

function makeWorktree(id: string, path: string, isMainWorktree = false): Worktree {
  return {
    id,
    repoId: 'repo1',
    path,
    head: 'abc',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree,
    displayName: id,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
}

const repo: Repo = { id: 'repo1', path: '/repo', displayName: 'R', badgeColor: '#000', addedAt: 0 }
const repoMap = new Map([[repo.id, repo]])

// Fork contract: the sort anchor is the repo-path checkout. After an in-place
// default switch git's isMainWorktree follows the DISPLACED checkout, so
// anchoring on it would pin the wrong row to the top of the repo group.
describe('orderDefaultCheckoutFirst', () => {
  it('anchors the repo-path row first even when git main is elsewhere', () => {
    const displacedGitMain = makeWorktree('a', '/wt/feature', true)
    const repoPathRow = makeWorktree('b', '/repo', false)
    const other = makeWorktree('c', '/wt/other', false)

    const ordered = orderDefaultCheckoutFirst([displacedGitMain, repoPathRow, other], repoMap)

    expect(ordered.map((worktree) => worktree.id)).toEqual(['b', 'a', 'c'])
  })

  it('falls back to git main when no row sits at the repo path', () => {
    const gitMain = makeWorktree('a', '/wt/main', true)
    const other = makeWorktree('b', '/wt/other', false)

    const ordered = orderDefaultCheckoutFirst([other, gitMain], repoMap)

    expect(ordered.map((worktree) => worktree.id)).toEqual(['a', 'b'])
  })

  it('leaves the order untouched when nothing anchors', () => {
    const one = makeWorktree('a', '/wt/one', false)
    const two = makeWorktree('b', '/wt/two', false)

    expect(orderDefaultCheckoutFirst([one, two], repoMap)).toEqual([one, two])
  })
})
