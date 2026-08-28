import { describe, expect, it } from 'vitest'
import { resolveWorktreeFolderTree, type WorktreeFolderMember } from './resolve'
import type { WorktreeFolder } from './types'

function folder(id: string, overrides: Partial<WorktreeFolder> = {}): WorktreeFolder {
  return { id, name: id, parentFolderId: null, createdAt: 1, ...overrides }
}

function member(id: string, overrides: Partial<WorktreeFolderMember> = {}): WorktreeFolderMember {
  return { id, ...overrides }
}

const topLevelIds = (tree: ReturnType<typeof resolveWorktreeFolderTree>): string[] =>
  (tree.foldersByParentId.get(null) ?? []).map((entry) => entry.id)

describe('resolveWorktreeFolderTree', () => {
  it('renders a worktree unfiled when its folder id names no folder', () => {
    const tree = resolveWorktreeFolderTree(
      [folder('folder-a')],
      [
        member('worktree-1', { worktreeFolderId: 'folder-a' }),
        member('worktree-2', { worktreeFolderId: 'folder-gone' })
      ]
    )

    expect(tree.worktreeIdsByFolderId.get('folder-a')).toEqual(['worktree-1'])
    expect(tree.unfiledWorktreeIds).toEqual(['worktree-2'])
    expect(tree.folderIdByWorktreeId.has('worktree-2')).toBe(false)
  })

  it('renders a folder at top level when its parentFolderId names no folder', () => {
    const tree = resolveWorktreeFolderTree(
      [folder('folder-a'), folder('folder-b', { parentFolderId: 'folder-gone' })],
      []
    )

    expect(topLevelIds(tree).sort()).toEqual(['folder-a', 'folder-b'])
    expect(tree.brokenParentFolderIds.has('folder-b')).toBe(true)
  })

  it('treats an absent parentFolderId as top level', () => {
    const tree = resolveWorktreeFolderTree([{ id: 'folder-a', name: 'A', createdAt: 1 }], [])

    expect(topLevelIds(tree)).toEqual(['folder-a'])
    expect(tree.brokenParentFolderIds.size).toBe(0)
  })

  it('breaks a folder cycle without walking forever', () => {
    const tree = resolveWorktreeFolderTree(
      [
        folder('folder-a', { parentFolderId: 'folder-c' }),
        folder('folder-b', { parentFolderId: 'folder-a' }),
        folder('folder-c', { parentFolderId: 'folder-b' }),
        folder('folder-d', { parentFolderId: 'folder-d' }),
        folder('folder-e')
      ],
      [member('worktree-1', { worktreeFolderId: 'folder-a' })]
    )

    // Every looping edge is dropped, so the whole cycle surfaces at top level.
    expect(topLevelIds(tree).sort()).toEqual([
      'folder-a',
      'folder-b',
      'folder-c',
      'folder-d',
      'folder-e'
    ])
    expect([...tree.brokenParentFolderIds].sort()).toEqual([
      'folder-a',
      'folder-b',
      'folder-c',
      'folder-d'
    ])
    // A cycle must not cost the worktrees their membership.
    expect(tree.worktreeIdsByFolderId.get('folder-a')).toEqual(['worktree-1'])
  })

  it('lets lineage win inside a folder: a child follows its parent, not its own folder id', () => {
    const tree = resolveWorktreeFolderTree(
      [folder('folder-a'), folder('folder-b')],
      [
        member('worktree-1', { worktreeFolderId: 'folder-a' }),
        member('worktree-2', {
          parentWorktreeId: 'worktree-1',
          worktreeFolderId: 'folder-b'
        }),
        member('worktree-3', { parentWorktreeId: 'worktree-2' })
      ]
    )

    expect(tree.worktreeIdsByFolderId.get('folder-a')).toEqual([
      'worktree-1',
      'worktree-2',
      'worktree-3'
    ])
    expect(tree.worktreeIdsByFolderId.has('folder-b')).toBe(false)
    expect(tree.unfiledWorktreeIds).toEqual([])
  })

  it('unfiles a lineage subtree whose root is unfiled, ignoring a child folder id', () => {
    const tree = resolveWorktreeFolderTree(
      [folder('folder-a')],
      [
        member('worktree-1'),
        member('worktree-2', { parentWorktreeId: 'worktree-1', worktreeFolderId: 'folder-a' })
      ]
    )

    expect(tree.unfiledWorktreeIds).toEqual(['worktree-1', 'worktree-2'])
    expect(tree.worktreeIdsByFolderId.size).toBe(0)
  })

  it('keeps a child filed on its own when the lineage parent is outside the set', () => {
    const tree = resolveWorktreeFolderTree(
      [folder('folder-a')],
      [member('worktree-2', { parentWorktreeId: 'worktree-1', worktreeFolderId: 'folder-a' })]
    )

    expect(tree.worktreeIdsByFolderId.get('folder-a')).toEqual(['worktree-2'])
  })

  it('survives a lineage cycle instead of hanging', () => {
    const tree = resolveWorktreeFolderTree(
      [folder('folder-a')],
      [
        member('worktree-1', { parentWorktreeId: 'worktree-2' }),
        member('worktree-2', { parentWorktreeId: 'worktree-1', worktreeFolderId: 'folder-a' })
      ]
    )

    const filed = tree.worktreeIdsByFolderId.get('folder-a')?.length ?? 0
    expect(tree.unfiledWorktreeIds.length + filed).toBe(2)
  })

  it('nests folders and ranks siblings highest manualOrder first', () => {
    const tree = resolveWorktreeFolderTree(
      [
        folder('folder-a', { manualOrder: 1 }),
        folder('folder-b', { manualOrder: 3 }),
        folder('folder-c', { parentFolderId: 'folder-a' }),
        folder('folder-d', { parentFolderId: 'folder-c' })
      ],
      []
    )

    expect(topLevelIds(tree)).toEqual(['folder-b', 'folder-a'])
    expect((tree.foldersByParentId.get('folder-a') ?? []).map((entry) => entry.id)).toEqual([
      'folder-c'
    ])
    expect((tree.foldersByParentId.get('folder-c') ?? []).map((entry) => entry.id)).toEqual([
      'folder-d'
    ])
  })

  it('reads an absent folder list as no folders', () => {
    const tree = resolveWorktreeFolderTree(undefined, [
      member('worktree-1', { worktreeFolderId: 'folder-a' })
    ])

    expect(tree.foldersByParentId.size).toBe(0)
    expect(tree.unfiledWorktreeIds).toEqual(['worktree-1'])
  })

  it('keeps the first record when a folder id is duplicated', () => {
    const tree = resolveWorktreeFolderTree(
      [folder('folder-a', { name: 'first' }), folder('folder-a', { name: 'second' })],
      []
    )

    expect((tree.foldersByParentId.get(null) ?? []).map((entry) => entry.name)).toEqual(['first'])
  })
})
