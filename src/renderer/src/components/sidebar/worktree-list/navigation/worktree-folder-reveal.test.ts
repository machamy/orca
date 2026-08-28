import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { worktree as worktreeFixture } from '../../worktree-list-groups-test-fixtures'
import { getWorktreeFolderRevealGroupKeys } from './worktree-folder-reveal'

const repo1: Repo = {
  id: 'repo1',
  path: '/tmp/repo1',
  displayName: 'repo1',
  badgeColor: '#000000',
  addedAt: 0,
  worktreeFolders: [
    { id: 'folder-a', name: 'folder-a', parentFolderId: null, createdAt: 1 },
    { id: 'folder-b', name: 'folder-b', parentFolderId: 'folder-a', createdAt: 2 }
  ]
}

const settingsOn = { experimentalWorktreeFolders: true } as never
const settingsOff = { experimentalWorktreeFolders: false } as never

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

function keysFor(args: {
  worktree: Worktree
  all: Worktree[]
  lineageById?: Record<string, WorktreeLineage>
  settings?: never
  repos?: readonly Repo[]
  groupBy?: 'none' | 'repo' | 'workspace-status' | 'pr-status'
}): string[] {
  return getWorktreeFolderRevealGroupKeys({
    worktree: args.worktree,
    hostWorktreeMap: new Map(args.all.map((worktree) => [worktree.id, worktree])),
    hostLineageById: args.lineageById ?? {},
    repos: args.repos ?? [repo1],
    settings: args.settings ?? settingsOn,
    groupBy: args.groupBy ?? 'repo',
    hostId: 'local'
  })
}

describe('getWorktreeFolderRevealGroupKeys', () => {
  const nestedMember = makeWorktree('worktree-1', { worktreeFolderId: 'folder-b' })

  it('returns the full ancestor chain, outermost first', () => {
    expect(keysFor({ worktree: nestedMember, all: [nestedMember] })).toEqual([
      'worktree-folder:folder-a',
      'worktree-folder:folder-b'
    ])
  })

  it('a lineage child inherits its root worktree folder chain', () => {
    const root = makeWorktree('worktree-2', { worktreeFolderId: 'folder-b' })
    const child = makeWorktree('worktree-3')
    expect(
      keysFor({
        worktree: child,
        all: [root, child],
        lineageById: { [child.id]: makeLineage(child, root) }
      })
    ).toEqual(['worktree-folder:folder-a', 'worktree-folder:folder-b'])
  })

  it('returns nothing when the toggle is off, the target is unfiled, or folders are hidden', () => {
    expect(keysFor({ worktree: nestedMember, all: [nestedMember], settings: settingsOff })).toEqual(
      []
    )
    const unfiled = makeWorktree('worktree-4')
    expect(keysFor({ worktree: unfiled, all: [unfiled] })).toEqual([])
    expect(
      keysFor({ worktree: nestedMember, all: [nestedMember], groupBy: 'workspace-status' })
    ).toEqual([])
  })

  it('membership pointing at a missing folder reads as unfiled', () => {
    const dangling = makeWorktree('worktree-5', { worktreeFolderId: 'folder-gone' })
    expect(keysFor({ worktree: dangling, all: [dangling] })).toEqual([])
  })

  it('survives a folder parent cycle without looping', () => {
    const cyclicRepo: Repo = {
      ...repo1,
      worktreeFolders: [
        { id: 'folder-a', name: 'folder-a', parentFolderId: 'folder-b', createdAt: 1 },
        { id: 'folder-b', name: 'folder-b', parentFolderId: 'folder-a', createdAt: 2 }
      ]
    }
    const member = makeWorktree('worktree-6', { worktreeFolderId: 'folder-a' })
    // Cyclic parents are dropped to top level, so the chain is just the folder itself.
    expect(keysFor({ worktree: member, all: [member], repos: [cyclicRepo] })).toEqual([
      'worktree-folder:folder-a'
    ])
  })
})
