import { describe, expect, it } from 'vitest'
import { toRuntimeWorktreeSelector } from './runtime-worktree-selector'

describe('toRuntimeWorktreeSelector (fork)', () => {
  it('never trims a raw worktree id, since a path may end in a space and name another worktree', () => {
    expect(toRuntimeWorktreeSelector(' wt-1 ')).toBe('id: wt-1 ')
  })
})
