import { describe, expect, it } from 'vitest'
import type { WorktreeFolder } from '../../../../shared/worktree-folder/types'
import { shouldShowWorktreeFolderMenuItems } from './worktree-folder-menu'
import {
  getEligibleWorktreeFolderReparentTargets,
  getWorktreeFolderSiblingIdsInRenderOrder
} from './WorktreeFolderRowMenu'

function folder(id: string, overrides: Partial<WorktreeFolder> = {}): WorktreeFolder {
  return { id, name: id, parentFolderId: null, createdAt: 1, ...overrides }
}

const folders = [
  folder('folder-a', { manualOrder: 1 }),
  folder('folder-b', { manualOrder: 3 }),
  folder('folder-c', { parentFolderId: 'folder-a' }),
  folder('folder-d', { parentFolderId: 'folder-c' })
]

describe('sibling render order (E2 reorder)', () => {
  it('ranks higher manualOrder first, scoped to one parent', () => {
    expect(getWorktreeFolderSiblingIdsInRenderOrder(folders, null)).toEqual([
      'folder-b',
      'folder-a'
    ])
    expect(getWorktreeFolderSiblingIdsInRenderOrder(folders, 'folder-a')).toEqual(['folder-c'])
  })
})

describe('reparent target eligibility (E2/E3 cycle refusal)', () => {
  it('excludes self, descendants and the current parent', () => {
    const targets = getEligibleWorktreeFolderReparentTargets(folders, 'folder-a').map(
      (target) => target.id
    )
    // folder-c/folder-d are descendants of folder-a; filing under them would loop.
    expect(targets).toEqual(['folder-b'])
  })

  it('offers ancestors other than the direct parent', () => {
    const targets = getEligibleWorktreeFolderReparentTargets(folders, 'folder-d').map(
      (target) => target.id
    )
    expect(targets.sort()).toEqual(['folder-a', 'folder-b'])
  })
})

describe('worktree-row folder items gating (X1)', () => {
  it('requires the experimental toggle and a git project', () => {
    const gitRepo = { kind: undefined } as never
    expect(shouldShowWorktreeFolderMenuItems({ experimentalWorktreeFolders: true }, gitRepo)).toBe(
      true
    )
    expect(shouldShowWorktreeFolderMenuItems({ experimentalWorktreeFolders: false }, gitRepo)).toBe(
      false
    )
    expect(shouldShowWorktreeFolderMenuItems(null, gitRepo)).toBe(false)
    expect(
      shouldShowWorktreeFolderMenuItems({ experimentalWorktreeFolders: true }, { kind: 'folder' })
    ).toBe(false)
    expect(shouldShowWorktreeFolderMenuItems({ experimentalWorktreeFolders: true }, null)).toBe(
      false
    )
  })
})
