import { describe, expect, it } from 'vitest'
import { buildWorktreeBranchWebUrl, worktreeBranchWebHostLabel } from './worktree-branch-web-url'

describe('buildWorktreeBranchWebUrl', () => {
  it('links a GitHub branch', () => {
    expect(
      buildWorktreeBranchWebUrl({ canonicalKey: 'github.com/machamy/orca', branch: 'main' })
    ).toBe('https://github.com/machamy/orca/tree/main')
  })

  it('uses each host its own branch route', () => {
    expect(buildWorktreeBranchWebUrl({ canonicalKey: 'gitlab.com/group/app', branch: 'dev' })).toBe(
      'https://gitlab.com/group/app/-/tree/dev'
    )
  })

  it('keeps a slashed branch a path, not one escaped component', () => {
    expect(
      buildWorktreeBranchWebUrl({ canonicalKey: 'github.com/o/r', branch: 'feature/user info' })
    ).toBe('https://github.com/o/r/tree/feature/user%20info')
  })

  it('answers nothing for a host whose branch route is unknown', () => {
    // Guessing would hand the user a broken link that looks official.
    expect(
      buildWorktreeBranchWebUrl({ canonicalKey: 'git.internal.example/team/app', branch: 'main' })
    ).toBeNull()
  })

  it('answers nothing without a remote or a branch', () => {
    expect(buildWorktreeBranchWebUrl({ canonicalKey: null, branch: 'main' })).toBeNull()
    expect(buildWorktreeBranchWebUrl({ canonicalKey: 'github.com/o/r', branch: '' })).toBeNull()
  })

  it('names the provider so the menu can say where the link goes', () => {
    expect(worktreeBranchWebHostLabel('github.com/o/r')).toBe('GitHub')
    expect(worktreeBranchWebHostLabel('git.internal.example/o/r')).toBeNull()
  })
})
