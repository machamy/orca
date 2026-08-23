import { beforeEach, describe, expect, it } from 'vitest'
import {
  armWorktreeIdentityGrace,
  clearWorktreeIdentityGraceForTests,
  isWorktreeIdentityShielded,
  sweepExpiredWorktreeIdentityGrace,
  WORKTREE_IDENTITY_GRACE_MS
} from './worktree-identity-grace'

describe('worktree identity grace', () => {
  beforeEach(() => {
    clearWorktreeIdentityGraceForTests()
  })

  it('shields armed ids for the grace window and expires them after', () => {
    armWorktreeIdentityGrace(['repo::/old', 'repo::/new'], WORKTREE_IDENTITY_GRACE_MS, 1_000)

    expect(isWorktreeIdentityShielded('repo::/old', 1_000)).toBe(true)
    expect(isWorktreeIdentityShielded('repo::/new', 1_000 + WORKTREE_IDENTITY_GRACE_MS - 1)).toBe(
      true
    )
    expect(isWorktreeIdentityShielded('repo::/old', 1_000 + WORKTREE_IDENTITY_GRACE_MS)).toBe(false)
    expect(isWorktreeIdentityShielded('repo::/other', 1_000)).toBe(false)
  })

  it('re-arming extends an existing shield', () => {
    armWorktreeIdentityGrace(['repo::/old'], WORKTREE_IDENTITY_GRACE_MS, 1_000)
    armWorktreeIdentityGrace(['repo::/old'], WORKTREE_IDENTITY_GRACE_MS, 5_000)

    expect(isWorktreeIdentityShielded('repo::/old', 5_000 + WORKTREE_IDENTITY_GRACE_MS - 1)).toBe(
      true
    )
  })

  it('sweep drops only expired entries', () => {
    armWorktreeIdentityGrace(['repo::/old'], 1_000, 0)
    armWorktreeIdentityGrace(['repo::/new'], 10_000, 0)

    sweepExpiredWorktreeIdentityGrace(5_000)

    expect(isWorktreeIdentityShielded('repo::/old', 500)).toBe(false)
    expect(isWorktreeIdentityShielded('repo::/new', 5_000)).toBe(true)
  })
})
