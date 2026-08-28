import { describe, expect, it } from 'vitest'
import type { AppState } from '@/store/types'
import type { WorktreeFolder } from '../../../../shared/worktree-folder/types'
import type { Worktree } from '../../../../shared/worktree/types'
import { collectRawWorktreeFolderMemberIds } from '@/store/slices/worktree-folder-membership'
import { worktree as worktreeFixture } from './worktree-list-groups-test-fixtures'
import {
  buildWorktreeFolderDeletePlan,
  getWorktreeFolderDeleteDialogLines
} from './WorktreeFolderDeleteDialog'

function folder(id: string, overrides: Partial<WorktreeFolder> = {}): WorktreeFolder {
  return { id, name: id, parentFolderId: null, createdAt: 1, ...overrides }
}

function makeWorktree(id: string, overrides: Partial<Worktree> = {}): Worktree {
  return { ...worktreeFixture, id, repoId: 'repo1', ...overrides }
}

const folders = [
  folder('folder-a'),
  folder('folder-b', { parentFolderId: 'folder-a' }),
  folder('folder-c', { parentFolderId: 'folder-b' })
]

describe('E4 delete dialog copy', () => {
  it('N is the raw direct member count and never proposes workspace deletion', () => {
    const plan = buildWorktreeFolderDeletePlan(folders, 'folder-a', 2)
    expect(plan).not.toBeNull()
    // Closed copy: members move out, children promote, nothing else is on offer.
    expect(getWorktreeFolderDeleteDialogLines(plan!)).toEqual([
      '2 workspaces move out of this folder.',
      'Folders folder-b move to the top level.',
      'No workspace is deleted.'
    ])
  })

  it('names where child folders promote — a parent folder by name, otherwise top level', () => {
    const topLevel = buildWorktreeFolderDeletePlan(folders, 'folder-a', 0)
    expect(getWorktreeFolderDeleteDialogLines(topLevel!)).toContain(
      'Folders folder-b move to the top level.'
    )
    const nested = buildWorktreeFolderDeletePlan(folders, 'folder-b', 1)
    expect(nested?.promotionTargetName).toBe('folder-a')
    expect(getWorktreeFolderDeleteDialogLines(nested!)).toContain(
      'Folders folder-c move into “folder-a”.'
    )
    expect(getWorktreeFolderDeleteDialogLines(nested!)).toContain(
      '1 workspace moves out of this folder.'
    )
  })
})

describe('B8a raw member enumeration for the dialog count', () => {
  it('counts stored membership (hidden rows included), not lineage-only visual members', () => {
    // worktree-2 renders under folder-a only through lineage; its stored
    // membership is absent, so the dialog must not count it. worktree-3 is
    // hidden (detected list only) and MUST be counted.
    const state = {
      worktreesByRepo: {
        repo1: [
          makeWorktree('repo1::/tmp/worktree-1', { worktreeFolderId: 'folder-a' }),
          makeWorktree('repo1::/tmp/worktree-2')
        ]
      },
      detectedWorktreesByRepo: {
        repo1: {
          worktrees: [makeWorktree('repo1::/tmp/worktree-3', { worktreeFolderId: 'folder-a' })]
        }
      }
    } as unknown as Pick<AppState, 'worktreesByRepo' | 'detectedWorktreesByRepo'>

    const memberIds = collectRawWorktreeFolderMemberIds(state, { id: 'repo1' }, 'folder-a')
    expect(memberIds.sort()).toEqual(['repo1::/tmp/worktree-1', 'repo1::/tmp/worktree-3'])
  })

  it('deduplicates a member present in both the visible and detected lists', () => {
    const shared = makeWorktree('repo1::/tmp/worktree-1', { worktreeFolderId: 'folder-a' })
    const state = {
      worktreesByRepo: { repo1: [shared] },
      detectedWorktreesByRepo: { repo1: { worktrees: [shared] } }
    } as unknown as Pick<AppState, 'worktreesByRepo' | 'detectedWorktreesByRepo'>
    expect(collectRawWorktreeFolderMemberIds(state, { id: 'repo1' }, 'folder-a')).toEqual([
      'repo1::/tmp/worktree-1'
    ])
  })
})
