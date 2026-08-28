// @vitest-environment happy-dom

// Fork contract: an agent-send target hidden inside a collapsed worktree folder
// must force that folder's ancestor chain open, like sections and lineage groups.
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { worktree as worktreeFixture } from '../../worktree-list-groups-test-fixtures'
import type { ProjectGroupingModel } from '../grouping/project-grouping'
import { useEffectiveCollapsedGroups } from './use-collapsed-groups'

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

function effectiveGroups(args: {
  collapsedGroups: Set<string>
  agentSendTargetWorktreeId: string | null
  worktrees: Worktree[]
}): Set<string> {
  const { result } = renderHook(() =>
    useEffectiveCollapsedGroups({
      collapsedGroups: args.collapsedGroups,
      agentSendTargetWorktreeId: args.agentSendTargetWorktreeId,
      groupBy: 'none',
      pinnedDisplayPolicy: 'duplicate-in-groups',
      visibleWorktrees: args.worktrees,
      repoMap: new Map([['repo1', repo1]]),
      repos: [repo1],
      worktreeMap: new Map(args.worktrees.map((worktree) => [worktree.id, worktree])),
      worktreeLineageById: {},
      prCache: null,
      workspaceStatuses: [],
      settings: { experimentalWorktreeFolders: true } as never,
      projectGroups: [],
      projectGrouping: undefined as unknown as ProjectGroupingModel,
      folderWorkspaces: [],
      defaultHostId: 'local'
    })
  )
  return result.current
}

describe('useEffectiveCollapsedGroups worktree folders', () => {
  const member = makeWorktree('worktree-1', { worktreeFolderId: 'folder-b' })

  it('un-collapses the folder ancestor chain hiding the agent-send target', () => {
    const effective = effectiveGroups({
      collapsedGroups: new Set([
        'worktree-folder:folder-a',
        'worktree-folder:folder-b',
        'worktree-folder:unrelated'
      ]),
      agentSendTargetWorktreeId: member.id,
      worktrees: [member]
    })
    expect(effective.has('worktree-folder:folder-a')).toBe(false)
    expect(effective.has('worktree-folder:folder-b')).toBe(false)
    // Unrelated folders stay as the user left them.
    expect(effective.has('worktree-folder:unrelated')).toBe(true)
  })

  it('leaves folder keys collapsed while no send target is armed', () => {
    const collapsed = new Set(['worktree-folder:folder-a', 'worktree-folder:folder-b'])
    expect(
      effectiveGroups({
        collapsedGroups: collapsed,
        agentSendTargetWorktreeId: null,
        worktrees: [member]
      })
    ).toBe(collapsed)
  })
})
