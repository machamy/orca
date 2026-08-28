import { describe, expect, it } from 'vitest'
import type { WorktreeFolderRow } from '../grouping/row-types'
import type { RenderRow } from '../listing/render-row'
import { getRenderRowKey } from '../listing/render-row'
import {
  buildLineageRowRekeyMap,
  estimateRenderRowSize,
  WORKTREE_FOLDER_ROW_HEIGHT
} from './virtual-rows'

function makeFolderRow(memberCount: number): WorktreeFolderRow {
  return {
    type: 'worktree-folder',
    key: 'worktree-folder:local:repo:repo1:folder-a:0',
    folder: { id: 'folder-a', name: 'folder-a', parentFolderId: null, createdAt: 1 },
    repo: { id: 'repo1', path: '/tmp/repo1', displayName: 'repo1', badgeColor: '#000', addedAt: 0 },
    hostId: 'local',
    sectionKey: 'repo:repo1',
    groupDepth: 0,
    folderDepth: 0,
    memberCount,
    collapsed: false
  }
}

describe('worktree folder row virtualizer estimate (C3)', () => {
  it('estimates at its own constant, never through the lineage-group formula', () => {
    const rows: RenderRow[] = [makeFolderRow(3)]
    expect(estimateRenderRowSize(rows, 0, -1, null)).toBe(WORKTREE_FOLDER_ROW_HEIGHT)
    // The lineage-group arm would have been 100 + (n - 1) * 96; the item fallback 116.
    expect(estimateRenderRowSize(rows, 0, -1, null)).not.toBe(100 + 2 * 96)
    expect(estimateRenderRowSize(rows, 0, -1, null)).not.toBe(116)
  })

  it('C2: the render key is identical with zero members and with three — no rekey entry needed', () => {
    const empty = makeFolderRow(0)
    const populated = makeFolderRow(3)
    expect(getRenderRowKey(empty)).toBe(getRenderRowKey(populated))
    // A folder never flips row type on gaining/losing members, so the rekey map ignores it.
    expect(buildLineageRowRekeyMap([empty, populated]).size).toBe(0)
  })
})
