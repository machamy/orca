import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import { worktree as worktreeFixture } from './worktree-list-groups-test-fixtures'
import {
  convertWorktreeToFolder,
  getDirectWorktreeLineageChildren,
  getValidWorktreeLineageParent,
  unnestAndFileWorktreesIntoFolder
} from './worktree-folder-conversion'

const repo1: Repo = {
  id: 'repo1',
  path: '/tmp/repo1',
  displayName: 'repo1',
  badgeColor: '#000000',
  addedAt: 0
}

function makeWorktree(id: string, overrides: Partial<Worktree> = {}): Worktree {
  return {
    ...worktreeFixture,
    id,
    repoId: 'repo1',
    instanceId: `${id}-instance`,
    displayName: id,
    ...overrides
  }
}

function makeLineage(child: Worktree, parent: Worktree): WorktreeLineage {
  return {
    worktreeId: child.id,
    worktreeInstanceId: child.instanceId!,
    parentWorktreeId: parent.id,
    parentWorktreeInstanceId: parent.instanceId!,
    origin: 'cli',
    capture: { source: 'terminal-context', confidence: 'inferred' },
    createdAt: 1
  }
}

// Three-level fixture (doc §11): parent → direct children → grandchild.
const parent = makeWorktree('worktree-1')
const childA = makeWorktree('worktree-2')
const childB = makeWorktree('worktree-3')
const grandchild = makeWorktree('worktree-4')
const worktrees = [parent, childA, childB, grandchild]
const lineageById = {
  [childA.id]: makeLineage(childA, parent),
  [childB.id]: makeLineage(childB, parent),
  [grandchild.id]: makeLineage(grandchild, childA)
}

describe('getDirectWorktreeLineageChildren', () => {
  it('returns only valid DIRECT children — grandchildren stay with their own parents', () => {
    const direct = getDirectWorktreeLineageChildren(parent, worktrees, lineageById, new Set())
    expect(direct.map((worktree) => worktree.id)).toEqual([childA.id, childB.id])
  })

  it('drops instance-mismatched and cyclic edges', () => {
    const staleChild = makeWorktree('worktree-5', { instanceId: 'reused-instance' })
    const staleLineage = {
      ...makeLineage(staleChild, parent),
      worktreeInstanceId: 'stale-instance'
    }
    expect(
      getDirectWorktreeLineageChildren(
        parent,
        [parent, staleChild],
        { [staleChild.id]: staleLineage },
        new Set()
      )
    ).toEqual([])
    expect(
      getDirectWorktreeLineageChildren(parent, worktrees, lineageById, new Set([childA.id]))
    ).toEqual([childB])
  })
})

describe('getValidWorktreeLineageParent', () => {
  it('mirrors the direct-children edge standard from the child side', () => {
    expect(getValidWorktreeLineageParent(childA, worktrees, lineageById, new Set())).toBe(parent)
    expect(getValidWorktreeLineageParent(parent, worktrees, lineageById, new Set())).toBeNull()
    expect(
      getValidWorktreeLineageParent(childA, worktrees, lineageById, new Set([childA.id]))
    ).toBeNull()
  })

  it('rejects instance-mismatched and cross-repo edges — the resolver would not hide membership', () => {
    const staleChild = makeWorktree('worktree-5', { instanceId: 'reused-instance' })
    const staleLineage = {
      ...makeLineage(staleChild, parent),
      worktreeInstanceId: 'stale-instance'
    }
    expect(
      getValidWorktreeLineageParent(
        staleChild,
        [parent, staleChild],
        { [staleChild.id]: staleLineage },
        new Set()
      )
    ).toBeNull()
    const otherRepoParent = makeWorktree('worktree-6', { repoId: 'repo2' })
    const crossChild = makeWorktree('worktree-7')
    expect(
      getValidWorktreeLineageParent(
        crossChild,
        [otherRepoParent, crossChild],
        { [crossChild.id]: makeLineage(crossChild, otherRepoParent) },
        new Set()
      )
    ).toBeNull()
  })
})

describe('unnestAndFileWorktreesIntoFolder (E5 primitive)', () => {
  it('files a root row without touching lineage, and sequences un-nest before filing', async () => {
    const store = {
      setWorktreeFolderMembership: vi.fn().mockResolvedValue(true),
      updateWorktreeLineage: vi.fn().mockResolvedValue(undefined)
    }
    const result = await unnestAndFileWorktreesIntoFolder(
      store as never,
      [
        { id: childA.id, requiresUnnest: true },
        { id: 'worktree-root', requiresUnnest: false }
      ],
      'folder-a'
    )
    expect(result).toEqual({ complete: true, filed: true })
    expect(store.updateWorktreeLineage).toHaveBeenCalledTimes(1)
    expect(store.updateWorktreeLineage).toHaveBeenCalledWith(childA.id, { noParent: true })
    const [filedIds, folderId] = store.setWorktreeFolderMembership.mock.calls[0]
    expect([...filedIds].sort()).toEqual([childA.id, 'worktree-root'])
    expect(folderId).toBe('folder-a')
    // Filing after every un-nest: a still-nested row's membership is invisible.
    expect(store.setWorktreeFolderMembership.mock.invocationCallOrder[0]).toBeGreaterThan(
      store.updateWorktreeLineage.mock.invocationCallOrder[0]
    )
  })

  it('never files a row whose un-nest failed and reports the incompleteness', async () => {
    const store = {
      setWorktreeFolderMembership: vi.fn().mockResolvedValue(true),
      updateWorktreeLineage: vi.fn().mockRejectedValue(new Error('unnest failed'))
    }
    const result = await unnestAndFileWorktreesIntoFolder(
      store as never,
      [{ id: childA.id, requiresUnnest: true }],
      'folder-a'
    )
    expect(result).toEqual({ complete: false, filed: true })
    expect(store.setWorktreeFolderMembership).toHaveBeenCalledWith([], 'folder-a')
  })
})

describe('convertWorktreeToFolder (E5)', () => {
  it('clears exactly the direct children, files them, and only OFFERS deletion', async () => {
    const store = {
      createWorktreeFolder: vi
        .fn()
        .mockResolvedValue({ id: 'folder-a', name: 'worktree-1', createdAt: 1 }),
      setWorktreeFolderMembership: vi.fn().mockResolvedValue(true),
      updateWorktreeLineage: vi.fn().mockResolvedValue(undefined)
    }
    const direct = getDirectWorktreeLineageChildren(parent, worktrees, lineageById, new Set())

    const result = await convertWorktreeToFolder(store as never, {
      worktree: parent,
      repo: repo1,
      directChildren: direct
    })

    expect(store.createWorktreeFolder).toHaveBeenCalledWith(
      'repo1',
      { name: parent.displayName },
      { hostId: 'local' }
    )
    // Exactly the direct children's parents cleared — the grandchild untouched.
    expect(store.updateWorktreeLineage.mock.calls).toEqual(
      expect.arrayContaining([
        [childA.id, { noParent: true }],
        [childB.id, { noParent: true }]
      ])
    )
    expect(store.updateWorktreeLineage).toHaveBeenCalledTimes(2)
    const [filedIds, folderId] = store.setWorktreeFolderMembership.mock.calls[0]
    expect([...filedIds].sort()).toEqual([childA.id, childB.id])
    expect(folderId).toBe('folder-a')
    // The conversion never deletes: it reports an offerable result and nothing more.
    expect(result).toEqual({ folderId: 'folder-a', complete: true })
  })

  it('does not file a child whose un-nest failed — lineage would win and hide the write', async () => {
    const store = {
      createWorktreeFolder: vi
        .fn()
        .mockResolvedValue({ id: 'folder-a', name: 'worktree-1', createdAt: 1 }),
      setWorktreeFolderMembership: vi.fn().mockResolvedValue(true),
      updateWorktreeLineage: vi.fn(async (worktreeId: string) => {
        if (worktreeId === childB.id) {
          throw new Error('unnest failed')
        }
      })
    }
    const direct = getDirectWorktreeLineageChildren(parent, worktrees, lineageById, new Set())

    const result = await convertWorktreeToFolder(store as never, {
      worktree: parent,
      repo: repo1,
      directChildren: direct
    })

    expect(store.setWorktreeFolderMembership).toHaveBeenCalledWith([childA.id], 'folder-a')
    expect(result).toEqual({ folderId: 'folder-a', complete: false })
  })

  it('stops without touching lineage when the folder create is refused', async () => {
    const store = {
      createWorktreeFolder: vi.fn().mockResolvedValue(null),
      setWorktreeFolderMembership: vi.fn(),
      updateWorktreeLineage: vi.fn()
    }
    const result = await convertWorktreeToFolder(store as never, {
      worktree: parent,
      repo: repo1,
      directChildren: [childA, childB]
    })
    expect(result).toBeNull()
    expect(store.updateWorktreeLineage).not.toHaveBeenCalled()
    expect(store.setWorktreeFolderMembership).not.toHaveBeenCalled()
  })
})
