import { describe, expect, it } from 'vitest'
import { listingLooksTruncated } from './worktree-listing-completeness'

/**
 * Observed live: a repo under ~/Documents lost eleven worktrees and their
 * twenty-four tabs twice in one afternoon. `git worktree list` had returned only
 * the main worktree — with no error — because the process could open the repo
 * but not `.git/worktrees`, which macOS gates per process for that folder.
 */
describe('listingLooksTruncated', () => {
  const exists = (present: readonly string[]) => (path: string) => present.includes(path)

  it('rejects a listing that dropped a worktree whose folder is still there', () => {
    expect(
      listingLooksTruncated({
        storedWorktreePaths: ['/repo', '/wt/a', '/wt/b'],
        listedPaths: ['/repo'],
        pathExists: exists(['/repo', '/wt/a', '/wt/b'])
      })
    ).toBe(true)
  })

  it('accepts a listing after the worktree was really removed', () => {
    // `git worktree remove` takes the directory with it, which is what separates
    // a real removal from a listing the process was not allowed to read.
    expect(
      listingLooksTruncated({
        storedWorktreePaths: ['/repo', '/wt/gone'],
        listedPaths: ['/repo'],
        pathExists: exists(['/repo'])
      })
    ).toBe(false)
  })

  it('accepts a complete listing', () => {
    expect(
      listingLooksTruncated({
        storedWorktreePaths: ['/repo', '/wt/a'],
        listedPaths: ['/repo', '/wt/a'],
        pathExists: exists(['/repo', '/wt/a'])
      })
    ).toBe(false)
  })

  it('accepts a repo with nothing stored yet', () => {
    expect(
      listingLooksTruncated({ storedWorktreePaths: [], listedPaths: [], pathExists: () => true })
    ).toBe(false)
  })
})
