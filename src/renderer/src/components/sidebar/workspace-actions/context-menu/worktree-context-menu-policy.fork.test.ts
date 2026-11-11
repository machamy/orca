import { describe, expect, it } from 'vitest'
import {
  isContextWorktreeDeletable,
  shouldRemoveProjectFromContextMenu
} from './worktree-context-menu-policy'

describe('project removal from workspace context menus (repo-path checkout)', () => {
  it('routes the repo-path checkout to project removal even when it is a linked worktree', () => {
    // After a default-worktree switch the repo-path row is no longer git's main worktree.
    const gitRepo = { id: 'repo-1', path: '/repo' }
    expect(
      shouldRemoveProjectFromContextMenu(gitRepo, { isMainWorktree: false, path: '/repo' })
    ).toBe(true)
    expect(
      isContextWorktreeDeletable(
        { isMainWorktree: false, path: '/repo' },
        { kind: 'git' as const, path: '/repo' }
      )
    ).toBe(false)
  })

  it('keeps other checkouts deletable and off the project-removal route', () => {
    const gitRepo = { id: 'repo-1', path: '/repo' }
    const folderRepo = { kind: 'folder' as const, path: '/folder' }

    expect(
      shouldRemoveProjectFromContextMenu(gitRepo, { isMainWorktree: false, path: '/repo/sub' })
    ).toBe(false)
    expect(shouldRemoveProjectFromContextMenu(null, { isMainWorktree: true, path: '/repo' })).toBe(
      false
    )
    expect(
      isContextWorktreeDeletable({ isMainWorktree: false, path: '/folder/a' }, folderRepo)
    ).toBe(true)
    expect(isContextWorktreeDeletable({ isMainWorktree: true, path: '/folder' }, folderRepo)).toBe(
      false
    )
  })
})
