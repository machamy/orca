import { describe, expect, it } from 'vitest'
import {
  filterSourceControlGroupedPathEntries,
  filterSourceControlPathEntries,
  getSourceControlFileFilterState,
  parseSourceControlExtensionFilter
} from './file-filter'

const paths = (query: string, candidates: string[]): string[] =>
  filterSourceControlPathEntries(
    candidates.map((path) => ({ path })),
    getSourceControlFileFilterState(query)
  ).map((entry) => entry.path)

const UNITY_CHANGES = [
  'Assets/Scripts/Player.cs',
  'Assets/Scripts/Player.cs.meta',
  'Assets/Scripts/Enemy.CS',
  'JobMaker.csproj',
  'web/site/style.css',
  'Assets/Resources/config.json',
  'docs/notes.md',
  'Assets/Prefabs/Hero.prefab',
  'Assets/Prefabs/Hero.prefab.meta'
]

describe('parseSourceControlExtensionFilter', () => {
  it('reads dotted tokens as suffixes and dedupes them', () => {
    expect(parseSourceControlExtensionFilter('.cs .json .cs')).toEqual(['.cs', '.json'])
  })

  it('accepts the glob spelling and commas', () => {
    expect(parseSourceControlExtensionFilter('*.cs, *.md')).toEqual(['.cs', '.md'])
  })

  it('keeps a multi-dot suffix whole', () => {
    expect(parseSourceControlExtensionFilter('.cs.meta')).toEqual(['.cs.meta'])
  })

  it('declines when any token is a bare word, so folder searches keep working', () => {
    expect(parseSourceControlExtensionFilter('.cs assets')).toBeNull()
    expect(parseSourceControlExtensionFilter('assets')).toBeNull()
  })
})

describe('filterSourceControlPathEntries', () => {
  it('leaves a bare word as the substring match it always was', () => {
    // "docs" contains "cs": that is the false positive the extension mode exists to avoid,
    // but a bare word must not change meaning under anyone's feet.
    expect(paths('cs', ['docs/notes.md', 'Assets/Player.cs'])).toEqual([
      'docs/notes.md',
      'Assets/Player.cs'
    ])
  })

  it('matches only the real extension, not .cs.meta, .csproj or .css', () => {
    expect(paths('.cs', UNITY_CHANGES)).toEqual([
      'Assets/Scripts/Player.cs',
      'Assets/Scripts/Enemy.CS'
    ])
  })

  it('ORs several extensions — the AI-review view', () => {
    expect(paths('.cs .json .md', UNITY_CHANGES)).toEqual([
      'Assets/Scripts/Player.cs',
      'Assets/Scripts/Enemy.CS',
      'Assets/Resources/config.json',
      'docs/notes.md'
    ])
  })

  it('lets a compound suffix pick the code files and only their metas', () => {
    expect(paths('.cs .cs.meta', UNITY_CHANGES)).toEqual([
      'Assets/Scripts/Player.cs',
      'Assets/Scripts/Player.cs.meta',
      'Assets/Scripts/Enemy.CS'
    ])
  })

  it('applies the same rule to every working-tree group', () => {
    const grouped = filterSourceControlGroupedPathEntries(
      {
        staged: [{ path: 'a.cs' }, { path: 'a.cs.meta' }],
        unstaged: [{ path: 'b.json' }, { path: 'b.png' }],
        untracked: [{ path: 'c.md' }, { path: 'c.csproj' }]
      },
      getSourceControlFileFilterState('.cs .json .md')
    )
    expect(grouped).toEqual({
      staged: [{ path: 'a.cs' }],
      unstaged: [{ path: 'b.json' }],
      untracked: [{ path: 'c.md' }]
    })
  })
})
