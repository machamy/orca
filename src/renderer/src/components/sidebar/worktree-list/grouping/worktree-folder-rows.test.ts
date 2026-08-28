import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import type { WorktreeFolder } from '../../../../../../shared/worktree-folder/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getDefaultSettings } from '../../../../../../shared/constants'
import { getWorktreeDragUnitGroups } from '../../worktree-drag-units'
import { shouldFiltersHideAllRows } from '../../sidebar-empty-state-gate'
import { worktree as worktreeFixture } from '../../worktree-list-groups-test-fixtures'
import { getRenderRowOptionId } from '../navigation/active-descendant-option'
import { buildRenderableRows } from '../listing/renderable-rows'
import { getRenderRowKey } from '../listing/render-row'
import { buildRows } from './build-rows'
import type { Row, WorktreeFolderRow, WorktreeRow } from './row-types'
import { getWorktreeFolderGroupKey } from './worktree-folder-rows'

const repo1: Repo = {
  id: 'repo1',
  path: '/tmp/repo1',
  displayName: 'repo1',
  badgeColor: '#000000',
  addedAt: 0
}

const folderA: WorktreeFolder = {
  id: 'folder-a',
  name: 'folder-a',
  parentFolderId: null,
  createdAt: 1
}
const folderB: WorktreeFolder = {
  id: 'folder-b',
  name: 'folder-b',
  parentFolderId: 'folder-a',
  createdAt: 2
}

const repo1WithFolders: Repo = { ...repo1, worktreeFolders: [folderA, folderB] }

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

function build(args: {
  groupBy?: 'none' | 'repo' | 'workspace-status' | 'pr-status'
  worktrees: Worktree[]
  repoMap?: Map<string, Repo>
  collapsedGroups?: Set<string>
  lineageById?: Record<string, WorktreeLineage>
  settings?: never
  repos?: readonly Repo[]
  runtimeStatusByEnvironmentId?: Map<string, { status: { capabilities?: string[] } | null }>
}): Row[] {
  const worktreeMap = new Map(args.worktrees.map((worktree) => [worktree.id, worktree]))
  return buildRows(
    args.groupBy ?? 'repo',
    args.worktrees,
    args.repoMap ?? new Map([[repo1WithFolders.id, repo1WithFolders]]),
    null,
    args.collapsedGroups ?? new Set(),
    undefined,
    undefined,
    undefined,
    args.lineageById ?? {},
    worktreeMap,
    true,
    args.settings,
    [],
    new Set(),
    new Map(),
    new Map(),
    [],
    undefined,
    [],
    undefined,
    undefined,
    undefined,
    args.repos,
    args.runtimeStatusByEnvironmentId
  )
}

function folderRows(rows: Row[]): WorktreeFolderRow[] {
  return rows.filter((row): row is WorktreeFolderRow => row.type === 'worktree-folder')
}

function itemIds(rows: Row[]): string[] {
  return rows.filter((row): row is WorktreeRow => row.type === 'item').map((row) => row.worktree.id)
}

describe('worktree folder rows — experimental toggle (X1–X3)', () => {
  const worktrees = [
    makeWorktree('worktree-1', { worktreeFolderId: 'folder-a' }),
    makeWorktree('worktree-2')
  ]

  it('X3: the toggle defaults to off', () => {
    expect(getDefaultSettings('/tmp/home').experimentalWorktreeFolders).toBe(false)
  })

  it('X1: off produces rows deep-equal to the pre-folder pipeline', () => {
    const baseline = build({ worktrees })
    expect(build({ worktrees, settings: settingsOff, repos: [repo1WithFolders] })).toEqual(baseline)
    // No settings at all reads as off too.
    expect(build({ worktrees, repos: [repo1WithFolders] })).toEqual(baseline)
  })

  it('C1: on with zero folder records is byte-identical to the pre-folder pipeline', () => {
    const bareRepoMap = new Map([[repo1.id, repo1]])
    const baseline = build({ worktrees, repoMap: bareRepoMap })
    expect(
      build({ worktrees, repoMap: bareRepoMap, settings: settingsOn, repos: [repo1] })
    ).toEqual(baseline)
  })

  it('on renders folder rows for filed worktrees', () => {
    const rows = build({ worktrees, settings: settingsOn, repos: [repo1WithFolders] })
    expect(folderRows(rows).map((row) => row.folder.id)).toEqual(['folder-a', 'folder-b'])
  })
})

describe('worktree folder rows — deep chains', () => {
  it('renders a 10_000-deep persisted folder chain without overflowing the stack', () => {
    // Depth is unbounded by design; survivability means iteration, not a cap.
    const depth = 10_000
    const chain: WorktreeFolder[] = []
    for (let index = 0; index < depth; index += 1) {
      chain.push({
        id: `deep-${index}`,
        name: `deep-${index}`,
        parentFolderId: index === 0 ? null : `deep-${index - 1}`,
        createdAt: index + 1
      })
    }
    const deepRepo: Repo = { ...repo1, worktreeFolders: chain }
    const worktrees = [makeWorktree('worktree-deep', { worktreeFolderId: `deep-${depth - 1}` })]

    const rows = build({
      worktrees,
      repoMap: new Map([[deepRepo.id, deepRepo]]),
      settings: settingsOn,
      repos: [deepRepo]
    })

    const folders = folderRows(rows)
    expect(folders).toHaveLength(depth)
    expect(folders[0]?.folderDepth).toBe(0)
    expect(folders.at(-1)?.folderDepth).toBe(depth - 1)
    expect(folders.at(-1)?.memberCount).toBe(1)
    expect(itemIds(rows)).toEqual(['worktree-deep'])
  })
})

describe('worktree folder rows — emission (C2, C7, F5a)', () => {
  const parent = makeWorktree('worktree-1', { worktreeFolderId: 'folder-a' })
  // Lineage wins (B5): the child's own membership is ignored in favour of its root's.
  const lineageChild = makeWorktree('worktree-2', { worktreeFolderId: 'folder-b' })
  const nestedMember = makeWorktree('worktree-3', { worktreeFolderId: 'folder-b' })
  const unfiled = makeWorktree('worktree-4')
  const worktrees = [parent, lineageChild, nestedMember, unfiled]
  const lineageById = { [lineageChild.id]: makeLineage(lineageChild, parent) }

  it('emits folder rows depth-first with members between, unfiled last', () => {
    const rows = build({ worktrees, lineageById, settings: settingsOn, repos: [repo1WithFolders] })
    expect(
      rows.map((row) =>
        row.type === 'worktree-folder'
          ? `folder:${row.folder.id}`
          : row.type === 'item'
            ? `item:${row.worktree.id}`
            : row.type
      )
    ).toEqual([
      'header',
      'folder:folder-a',
      'item:worktree-1',
      'item:worktree-2',
      'folder:folder-b',
      'item:worktree-3',
      'item:worktree-4'
    ])
  })

  it('keys are host- and section-qualified with a run index', () => {
    const rows = build({ worktrees, lineageById, settings: settingsOn, repos: [repo1WithFolders] })
    expect(folderRows(rows).map((row) => row.key)).toEqual([
      'worktree-folder:local:repo:repo1:folder-a:0',
      'worktree-folder:local:repo:repo1:folder-b:0'
    ])
  })

  it('member count is direct effective members only — lineage-inherited in, descendants out', () => {
    const rows = build({ worktrees, lineageById, settings: settingsOn, repos: [repo1WithFolders] })
    const [rowA, rowB] = folderRows(rows)
    // folder-a: worktree-1 plus the lineage-inherited worktree-2; folder-b's member not counted.
    expect(rowA.memberCount).toBe(2)
    expect(rowB.memberCount).toBe(1)
  })

  it('C7: member depth stays lineage depth; folder nesting rides its own field', () => {
    const rows = build({ worktrees, lineageById, settings: settingsOn, repos: [repo1WithFolders] })
    const items = rows.filter((row): row is WorktreeRow => row.type === 'item')
    const byId = new Map(items.map((row) => [row.worktree.id, row]))
    expect(byId.get('worktree-1')).toMatchObject({ depth: 0, worktreeFolderDepth: 1 })
    expect(byId.get('worktree-2')).toMatchObject({ depth: 1, worktreeFolderDepth: 1 })
    // Two folders deep, still a lineage root.
    expect(byId.get('worktree-3')).toMatchObject({ depth: 0, worktreeFolderDepth: 2 })
    expect(byId.get('worktree-4')?.worktreeFolderDepth).toBeUndefined()
    expect(folderRows(rows).map((row) => row.folderDepth)).toEqual([0, 1])
  })

  it('C2: a folder row keeps the same render key with zero members and with three', () => {
    const empty = build({
      worktrees: [unfiled],
      settings: settingsOn,
      repos: [repo1WithFolders]
    })
    const populated = build({
      worktrees: [
        makeWorktree('worktree-1', { worktreeFolderId: 'folder-a' }),
        makeWorktree('worktree-2', { worktreeFolderId: 'folder-a' }),
        makeWorktree('worktree-3', { worktreeFolderId: 'folder-a' }),
        unfiled
      ],
      settings: settingsOn,
      repos: [repo1WithFolders]
    })
    const emptyRow = folderRows(empty).find((row) => row.folder.id === 'folder-a')!
    const populatedRow = folderRows(populated).find((row) => row.folder.id === 'folder-a')!
    expect(emptyRow.memberCount).toBe(0)
    expect(populatedRow.memberCount).toBe(3)
    expect(getRenderRowKey(emptyRow)).toBe(getRenderRowKey(populatedRow))
  })

  it('status and PR groupings hide folders and stay byte-identical (the "hide" default)', () => {
    for (const groupBy of ['workspace-status', 'pr-status'] as const) {
      const baseline = build({ worktrees, lineageById, groupBy })
      const rows = build({
        worktrees,
        lineageById,
        groupBy,
        settings: settingsOn,
        repos: [repo1WithFolders]
      })
      expect(rows).toEqual(baseline)
      expect(folderRows(rows)).toEqual([])
    }
  })

  it('emits under groupBy none as the same tree, unsectioned', () => {
    const rows = build({
      worktrees,
      lineageById,
      groupBy: 'none',
      settings: settingsOn,
      repos: [repo1WithFolders]
    })
    expect(folderRows(rows).map((row) => row.key)).toEqual([
      'worktree-folder:local:all:folder-a:0',
      'worktree-folder:local:all:folder-b:0'
    ])
  })

  it('emits nothing when the section has no worktrees, so the empty state still wins', () => {
    const rows = build({ worktrees: [], settings: settingsOn, repos: [repo1WithFolders] })
    expect(rows).toEqual([])
  })
})

describe('worktree folder rows — collapse (C6)', () => {
  const memberA = makeWorktree('worktree-1', { worktreeFolderId: 'folder-a' })
  const memberB = makeWorktree('worktree-2', { worktreeFolderId: 'folder-b' })
  const unfiled = makeWorktree('worktree-3')
  const worktrees = [memberA, memberB, unfiled]

  it('a collapsed folder keeps its row and hides its whole subtree', () => {
    const rows = build({
      worktrees,
      collapsedGroups: new Set([getWorktreeFolderGroupKey('folder-a')]),
      settings: settingsOn,
      repos: [repo1WithFolders]
    })
    const folders = folderRows(rows)
    expect(folders.map((row) => row.folder.id)).toEqual(['folder-a'])
    expect(folders[0].collapsed).toBe(true)
    expect(itemIds(rows)).toEqual(['worktree-3'])
  })

  it('collapsing a nested folder hides only its own members', () => {
    const rows = build({
      worktrees,
      collapsedGroups: new Set([getWorktreeFolderGroupKey('folder-b')]),
      settings: settingsOn,
      repos: [repo1WithFolders]
    })
    expect(folderRows(rows).map((row) => [row.folder.id, row.collapsed])).toEqual([
      ['folder-a', false],
      ['folder-b', true]
    ])
    expect(itemIds(rows)).toEqual(['worktree-1', 'worktree-3'])
  })
})

describe('worktree folder rows — host scoping', () => {
  it('same repo id on two hosts emits one folder row per host with host-qualified keys', () => {
    const runtimeRepo: Repo = {
      ...repo1WithFolders,
      executionHostId: 'runtime:03ef704c-b180-4b10-998d-e28fbd5de9a3'
    }
    const local = makeWorktree('worktree-1', { hostId: 'local', worktreeFolderId: 'folder-a' })
    const remote = makeWorktree('worktree-1', {
      hostId: 'runtime:03ef704c-b180-4b10-998d-e28fbd5de9a3',
      instanceId: 'worktree-1-remote-instance',
      worktreeFolderId: 'folder-a'
    })
    const rows = build({
      groupBy: 'none',
      worktrees: [local, remote],
      settings: settingsOn,
      repos: [repo1WithFolders, runtimeRepo]
    })
    const keys = folderRows(rows).map((row) => row.key)
    expect(keys).toContain('worktree-folder:local:all:folder-a:0')
    expect(keys).toContain(
      'worktree-folder:runtime:03ef704c-b180-4b10-998d-e28fbd5de9a3:all:folder-a:0'
    )
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('worktree folder rows — drag units and renderable rows (C8, C9)', () => {
  const rootOne = makeWorktree('worktree-1', { worktreeFolderId: 'folder-a' })
  const rootTwo = makeWorktree('worktree-2', { worktreeFolderId: 'folder-a' })
  const childOfOne = makeWorktree('worktree-3')
  const lineageById = { [childOfOne.id]: makeLineage(childOfOne, rootOne) }
  const worktrees = [rootOne, rootTwo, childOfOne]

  it('C8: two independent lineage roots in one folder stay separate drag units', () => {
    const rows = build({ worktrees, lineageById, settings: settingsOn, repos: [repo1WithFolders] })
    const groups = getWorktreeDragUnitGroups(rows as never)
    expect(groups).toHaveLength(1)
    expect(groups[0].units.map((unit) => unit.worktreeIds)).toEqual([
      ['worktree-1', 'worktree-3'],
      ['worktree-2']
    ])
  })

  it('C9: lineage-group virtual rows are identical with and without folders', () => {
    const withFolders = build({
      worktrees,
      lineageById,
      settings: settingsOn,
      repos: [repo1WithFolders]
    })
    const without = build({ worktrees, lineageById })
    const lineageGroupsOf = (rows: Row[]) =>
      buildRenderableRows(rows as never)
        .filter((row) => row.type === 'lineage-group')
        .map((row) =>
          row.type === 'lineage-group' ? row.rows.map((item) => item.worktree.id) : []
        )
    expect(lineageGroupsOf(withFolders)).toEqual(lineageGroupsOf(without))
  })

  it('D3: a folder row never answers an option id for aria-activedescendant', () => {
    const rows = build({ worktrees, lineageById, settings: settingsOn, repos: [repo1WithFolders] })
    for (const row of folderRows(rows)) {
      expect(getRenderRowOptionId(row)).toBeUndefined()
    }
  })
})

describe('sidebar empty-state gate ignores folder rows', () => {
  it('folder rows are not an input: filters hiding all counted content still empty the sidebar', () => {
    expect(
      shouldFiltersHideAllRows({
        hasFilters: true,
        visibleWorktreeCount: 0,
        visibleFolderWorkspaceCount: 0,
        placeholderRepoCount: 0,
        importedWorktreeCardCount: 0
      })
    ).toBe(true)
  })
})

describe('worktree folder rows — capability suppression (G5a)', () => {
  const RUNTIME_ENV_ID = '03ef704c-b180-4b10-998d-e28fbd5de9a3'
  const RUNTIME_HOST_ID = `runtime:${RUNTIME_ENV_ID}` as const
  const runtimeRepo: Repo = { ...repo1WithFolders, executionHostId: RUNTIME_HOST_ID }
  const remote = makeWorktree('worktree-1', {
    hostId: RUNTIME_HOST_ID,
    worktreeFolderId: 'folder-a'
  })

  it('suppresses folder rows for a paired host whose status lacks the capability', () => {
    const rows = build({
      groupBy: 'none',
      worktrees: [remote],
      settings: settingsOn,
      repos: [runtimeRepo],
      runtimeStatusByEnvironmentId: new Map([
        [RUNTIME_ENV_ID, { status: { capabilities: ['runtime.status.compat.v1'] } }]
      ])
    })
    expect(folderRows(rows)).toHaveLength(0)
    // The member still renders — flat, exactly as an old host projects it.
    expect(rows.some((row) => row.type === 'item' && row.worktree.id === 'worktree-1')).toBe(true)
  })

  it('emits folder rows when the paired host advertises worktree.folders.v1', () => {
    const rows = build({
      groupBy: 'none',
      worktrees: [remote],
      settings: settingsOn,
      repos: [runtimeRepo],
      runtimeStatusByEnvironmentId: new Map([
        [RUNTIME_ENV_ID, { status: { capabilities: ['worktree.folders.v1'] } }]
      ])
    })
    expect(folderRows(rows).length).toBeGreaterThan(0)
  })

  it('does not suppress while the host status is unknown, or for local hosts', () => {
    const local = makeWorktree('worktree-2', { hostId: 'local', worktreeFolderId: 'folder-a' })
    const rows = build({
      groupBy: 'none',
      worktrees: [remote, local],
      settings: settingsOn,
      repos: [repo1WithFolders, runtimeRepo],
      runtimeStatusByEnvironmentId: new Map()
    })
    const keys = folderRows(rows).map((row) => row.key)
    expect(keys).toContain(`worktree-folder:${RUNTIME_HOST_ID}:all:folder-a:0`)
    expect(keys).toContain('worktree-folder:local:all:folder-a:0')
  })
})

// A raw NUL byte in this module once made git/diff treat the file as binary; the
// separator must stay the escape sequence in source while the runtime key keeps NUL.
describe('worktree-folder-rows source encoding', () => {
  it('holds no raw NUL byte', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(join(import.meta.dirname, 'worktree-folder-rows.ts'), 'utf8')
    expect(source.includes(String.fromCharCode(0))).toBe(false)
    expect(source).toContain(`${String.fromCharCode(92)}u0000`)
  })
})
