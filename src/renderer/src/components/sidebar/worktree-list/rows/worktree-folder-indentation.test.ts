import { describe, expect, it } from 'vitest'
import {
  getWorktreeCardContentIndent,
  getWorktreeFolderMemberIndent,
  getWorktreeFolderRowContentIndent
} from './indentation'

describe('worktree folder indentation', () => {
  it('composes worktree-folder depth as its own axis without touching lineage indent (C7/C10)', () => {
    expect(getWorktreeFolderMemberIndent(0)).toBe(0)
    expect(getWorktreeFolderMemberIndent(2)).toBe(36)
    // A member indents by exactly one folder axis on top of the unchanged base —
    // lineage indent for the same row stays what it was without folders.
    expect(
      getWorktreeFolderRowContentIndent({ isGrouped: true, groupDepth: 0, folderDepth: 0 })
    ).toBe(getWorktreeCardContentIndent({ isGrouped: true, groupDepth: 0, lineageDepth: 0 }))
    expect(
      getWorktreeFolderRowContentIndent({ isGrouped: false, groupDepth: 0, folderDepth: 2 })
    ).toBe(36)
    expect(
      getWorktreeFolderRowContentIndent({ isGrouped: true, groupDepth: 1, folderDepth: 1 })
    ).toBe(getWorktreeCardContentIndent({ isGrouped: true, groupDepth: 1, lineageDepth: 0 }) + 18)
  })
})
