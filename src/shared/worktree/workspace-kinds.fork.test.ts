import { describe, expect, it } from 'vitest'
import { isDefaultBranchWorkspaceAtRepoPath } from './visibility/workspace-kinds'

function makeWorktree(id: string, isMainWorktree = false) {
  return { path: `/tmp/${id}`, branch: 'refs/heads/main', isMainWorktree }
}

describe('isDefaultBranchWorkspaceAtRepoPath', () => {
  // After an in-place default-worktree switch git's main flag follows the displaced checkout.
  it('anchors on the repo-path checkout when the repo path is known', () => {
    const atRepoPath = makeWorktree('main')
    const displacedGitMain = makeWorktree('displaced', true)
    const repo = { kind: 'git' as const, path: atRepoPath.path }
    expect(isDefaultBranchWorkspaceAtRepoPath(atRepoPath, repo)).toBe(true)
    expect(isDefaultBranchWorkspaceAtRepoPath(displacedGitMain, repo)).toBe(false)
  })
})
