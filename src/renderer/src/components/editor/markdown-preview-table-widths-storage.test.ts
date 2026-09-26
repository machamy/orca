// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadMarkdownTableColumnWidths,
  saveMarkdownTableColumnWidths
} from './markdown-preview-table-widths-storage'

const KEY = 'orca.markdown-preview.table-widths.v1'

afterEach(() => {
  localStorage.clear()
})

describe('markdown preview table widths storage', () => {
  it('remembers widths per file and table', () => {
    saveMarkdownTableColumnWidths('/repo/a.md', 0, [120, null, 80])
    saveMarkdownTableColumnWidths('/repo/b.md', 0, [200, 200])
    expect(loadMarkdownTableColumnWidths('/repo/a.md', 0, 3)).toEqual([120, null, 80])
    expect(loadMarkdownTableColumnWidths('/repo/a.md', 1, 3)).toBeNull()
    expect(loadMarkdownTableColumnWidths('/repo/b.md', 0, 2)).toEqual([200, 200])
  })

  it('ignores saved widths once the table has a different column count', () => {
    saveMarkdownTableColumnWidths('/repo/a.md', 0, [120, 80])
    expect(loadMarkdownTableColumnWidths('/repo/a.md', 0, 3)).toBeNull()
  })

  it('forgets a table, then the file, when every column is back to auto', () => {
    saveMarkdownTableColumnWidths('/repo/a.md', 0, [120, 80])
    saveMarkdownTableColumnWidths('/repo/a.md', 0, [null, null])
    expect(loadMarkdownTableColumnWidths('/repo/a.md', 0, 2)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('keeps only the most recently resized files', () => {
    for (let i = 0; i < 205; i++) {
      saveMarkdownTableColumnWidths(`/repo/${i}.md`, 0, [100], i)
    }
    expect(loadMarkdownTableColumnWidths('/repo/0.md', 0, 1)).toBeNull()
    expect(loadMarkdownTableColumnWidths('/repo/204.md', 0, 1)).toEqual([100])
    expect(Object.keys(JSON.parse(localStorage.getItem(KEY) ?? '{}'))).toHaveLength(200)
  })

  it('treats corrupt or foreign data as nothing saved', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadMarkdownTableColumnWidths('/repo/a.md', 0, 1)).toBeNull()
    localStorage.setItem(KEY, JSON.stringify({ '/repo/a.md': { tables: { 0: { columns: 2 } } } }))
    expect(loadMarkdownTableColumnWidths('/repo/a.md', 0, 2)).toBeNull()
  })
})
