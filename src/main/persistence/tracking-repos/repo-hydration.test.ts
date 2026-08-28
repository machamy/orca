import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import { hydrateRepo } from './repo-hydration'

function repoFixture(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo1',
    path: '/tmp/repo1',
    displayName: 'repo1',
    badgeColor: '#000000',
    addedAt: 0,
    ...overrides
  } as Repo
}

// Fork contract: corrupt persisted worktreeFolders must degrade to flat — the
// sidebar resolver TypeErrors on a truthy non-array and takes the render down.
describe('hydrateRepo worktreeFolders normalization', () => {
  it('drops a truthy non-array value entirely', () => {
    const hydrated = hydrateRepo(
      repoFixture({ worktreeFolders: 'corrupt' as unknown as Repo['worktreeFolders'] }),
      new Map()
    )
    expect('worktreeFolders' in hydrated).toBe(false)
  })

  it('keeps only resolvable entries from a partially corrupt list', () => {
    const hydrated = hydrateRepo(
      repoFixture({
        worktreeFolders: [
          { id: 'folder-a', name: 'folder-a', parentFolderId: null, createdAt: 1 },
          { bogus: true },
          null
        ] as unknown as Repo['worktreeFolders']
      }),
      new Map()
    )
    expect(hydrated.worktreeFolders).toEqual([
      { id: 'folder-a', name: 'folder-a', parentFolderId: null, createdAt: 1 }
    ])
  })

  it('passes a valid list through unchanged', () => {
    const folders = [{ id: 'folder-a', name: 'folder-a', parentFolderId: null, createdAt: 1 }]
    const hydrated = hydrateRepo(repoFixture({ worktreeFolders: folders }), new Map())
    expect(hydrated.worktreeFolders).toEqual(folders)
  })
})
