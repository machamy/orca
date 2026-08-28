import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { toast } from 'sonner'
import type { AppState } from '../types'
import type { Repo } from '../../../../shared/repo-types'
import type { WorktreeFolder } from '../../../../shared/worktree-folder/types'
import { resolveWorktreeFolderTree } from '../../../../shared/worktree-folder/resolve'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import {
  createCompatibleRuntimeStatusResponse,
  type RuntimeEnvironmentCallRequest
} from '../../runtime/runtime-compatibility-test-fixture'
import { createWorktreeSlice } from './worktrees'
import { createWorktreeFolderSlice, wouldCreateWorktreeFolderCycle } from './worktree-folders'
import { makeWorktree } from './worktrees-slice-test-fixtures'
import { makeDetectedResult } from './worktrees-detected-listing-fixtures'
import {
  mockApi,
  resetRemoteRuntimeMocks,
  resetWorktreeSliceModuleMemory,
  runtimeEnvironmentCall,
  runtimeEnvironmentTransportCall
} from './worktrees-slice-test-harness'

vi.mock('sonner', () => ({
  toast: {
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn()
  }
}))

const repo1: Repo = {
  id: 'repo1',
  path: '/tmp/repo1',
  displayName: 'repo1',
  badgeColor: '#000000',
  addedAt: 0
}

function folderFixture(id: string, overrides: Partial<WorktreeFolder> = {}): WorktreeFolder {
  return { id, name: id, parentFolderId: null, createdAt: 1, ...overrides }
}

function createFolderTestStore() {
  const store = create<AppState>()(
    (set, get, api) =>
      ({
        ...createWorktreeSlice(set, get, api),
        ...createWorktreeFolderSlice(set, get, api),
        repos: [repo1],
        projectGroups: [],
        folderWorkspaces: [],
        runtimeEnvironmentCatalogHydrated: true,
        removedRuntimeEnvironmentIds: new Set<string>(),
        // Echo-applying stub: my slice's contract with updateRepo is "value in,
        // store row replaced on success" — the recipes and gate are under test.
        updateRepo: vi.fn(
          async (repoId: string, updates: Partial<Repo>, options?: { hostId?: string }) => {
            set((s) => ({
              repos: s.repos.map((candidate) =>
                candidate.id === repoId &&
                (!options?.hostId || getRepoExecutionHostId(candidate) === options.hostId)
                  ? { ...candidate, ...updates }
                  : candidate
              )
            }))
            return true
          }
        )
      }) as unknown as AppState
  )
  return store
}

function updateRepoMockOf(store: ReturnType<typeof createFolderTestStore>) {
  return vi.mocked(store.getState().updateRepo)
}

/** Transport that answers status.get without `worktree.folders.v1`. */
function stripFolderCapabilityFromStatus(): void {
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
    if (args.method === 'status.get') {
      const response = createCompatibleRuntimeStatusResponse()
      if (response.ok) {
        response.result = {
          ...response.result,
          capabilities: (response.result.capabilities ?? []).filter(
            (capability) => capability !== 'worktree.folders.v1'
          )
        }
      }
      return response
    }
    return runtimeEnvironmentCall(args)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetWorktreeSliceModuleMemory()
  resetRemoteRuntimeMocks()
})

describe('worktree folder slice — cycle guard', () => {
  const folders = [
    folderFixture('folder-a'),
    folderFixture('folder-b', { parentFolderId: 'folder-a' }),
    folderFixture('folder-c', { parentFolderId: 'folder-b' })
  ]

  it('refuses self and descendant targets, allows others', () => {
    expect(wouldCreateWorktreeFolderCycle(folders, 'folder-a', 'folder-a')).toBe(true)
    expect(wouldCreateWorktreeFolderCycle(folders, 'folder-a', 'folder-b')).toBe(true)
    expect(wouldCreateWorktreeFolderCycle(folders, 'folder-a', 'folder-c')).toBe(true)
    expect(wouldCreateWorktreeFolderCycle(folders, 'folder-c', 'folder-a')).toBe(false)
    expect(wouldCreateWorktreeFolderCycle(folders, 'folder-b', null)).toBe(false)
  })
})

describe('worktree folder slice — record CRUD', () => {
  it('E3a: creating the first folder and filing the worktree yields member count 1', async () => {
    const store = createFolderTestStore()
    const worktree = makeWorktree({ id: 'repo1::/tmp/worktree-1', repoId: 'repo1' })
    store.setState({ worktreesByRepo: { repo1: [worktree] } } as Partial<AppState>)

    const folder = await store.getState().createWorktreeFolder('repo1', { name: 'folder-a' })
    expect(folder).not.toBeNull()
    expect(await store.getState().setWorktreeFolderMembership([worktree.id], folder!.id)).toBe(true)

    const repo = store.getState().repos[0]
    expect(repo.worktreeFolders).toHaveLength(1)
    const filed = store.getState().worktreesByRepo.repo1[0]
    expect(filed.worktreeFolderId).toBe(folder!.id)
    const resolved = resolveWorktreeFolderTree(repo.worktreeFolders, [
      { id: filed.id, worktreeFolderId: filed.worktreeFolderId }
    ])
    expect(resolved.worktreeIdsByFolderId.get(folder!.id)).toEqual([worktree.id])
    expect(mockApi.worktrees.updateMeta).toHaveBeenCalledWith({
      worktreeId: worktree.id,
      updates: { worktreeFolderId: folder!.id }
    })
  })

  it('renames a folder and refuses unknown ids', async () => {
    const store = createFolderTestStore()
    store.setState({
      repos: [{ ...repo1, worktreeFolders: [folderFixture('folder-a')] }]
    } as Partial<AppState>)

    expect(
      await store.getState().renameWorktreeFolder('repo1', 'folder-a', 'folder-a-renamed')
    ).toBe(true)
    expect(store.getState().repos[0].worktreeFolders?.[0]?.name).toBe('folder-a-renamed')
    expect(await store.getState().renameWorktreeFolder('repo1', 'folder-x', 'anything')).toBe(false)
  })

  it('reparent refuses cycles without issuing a write', async () => {
    const store = createFolderTestStore()
    const folders = [
      folderFixture('folder-a'),
      folderFixture('folder-b', { parentFolderId: 'folder-a' })
    ]
    store.setState({ repos: [{ ...repo1, worktreeFolders: folders }] } as Partial<AppState>)

    expect(await store.getState().reparentWorktreeFolder('repo1', 'folder-a', 'folder-b')).toBe(
      false
    )
    expect(await store.getState().reparentWorktreeFolder('repo1', 'folder-a', 'folder-a')).toBe(
      false
    )
    expect(updateRepoMockOf(store)).not.toHaveBeenCalled()

    expect(await store.getState().reparentWorktreeFolder('repo1', 'folder-b', null)).toBe(true)
    expect(
      store.getState().repos[0].worktreeFolders?.find((folder) => folder.id === 'folder-b')
        ?.parentFolderId
    ).toBeNull()
  })

  it('concurrent creates both land — no stale-snapshot lost write', async () => {
    const store = createFolderTestStore()
    const [first, second] = await Promise.all([
      store.getState().createWorktreeFolder('repo1', { name: 'folder-a' }),
      store.getState().createWorktreeFolder('repo1', { name: 'folder-b' })
    ])
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(store.getState().repos[0].worktreeFolders?.map((folder) => folder.name)).toEqual(
      expect.arrayContaining(['folder-a', 'folder-b'])
    )
    expect(store.getState().repos[0].worktreeFolders).toHaveLength(2)
  })
})

describe('worktree folder slice — delete (B8/B8a)', () => {
  it('unfiles hidden members from the detected list, not just visible rows', async () => {
    const store = createFolderTestStore()
    const visible = makeWorktree({
      id: 'repo1::/tmp/worktree-1',
      repoId: 'repo1',
      worktreeFolderId: 'folder-a'
    })
    const hidden = makeWorktree({
      id: 'repo1::/tmp/worktree-2',
      repoId: 'repo1',
      path: '/tmp/worktree-2',
      worktreeFolderId: 'folder-a'
    })
    store.setState({
      repos: [
        {
          ...repo1,
          worktreeFolders: [
            folderFixture('folder-a'),
            folderFixture('folder-b', { parentFolderId: 'folder-a' })
          ]
        }
      ],
      worktreesByRepo: { repo1: [visible] },
      detectedWorktreesByRepo: { repo1: makeDetectedResult('repo1', [hidden]) }
    } as Partial<AppState>)

    expect(await store.getState().deleteWorktreeFolder('repo1', 'folder-a')).toBe(true)

    const nextFolders = store.getState().repos[0].worktreeFolders ?? []
    expect(nextFolders.map((folder) => folder.id)).toEqual(['folder-b'])
    // Child folder promoted to the deleted folder's parent (top level here).
    expect(nextFolders[0].parentFolderId).toBeNull()
    expect(store.getState().worktreesByRepo.repo1[0].worktreeFolderId).toBeUndefined()
    expect(
      store.getState().detectedWorktreesByRepo.repo1.worktrees[0].worktreeFolderId
    ).toBeUndefined()
    const unfiledIds = vi
      .mocked(mockApi.worktrees.updateMeta)
      .mock.calls.map(([args]) => (args as { worktreeId: string }).worktreeId)
    expect(unfiledIds).toEqual(expect.arrayContaining([visible.id, hidden.id]))
    // No workspace delete API is touched.
    expect(mockApi.worktrees.remove).not.toHaveBeenCalled()
  })
})

describe('worktree folder slice — delete ordering and host scoping', () => {
  it('a failed member unfile leaves the folder record in place — no dangling membership', async () => {
    const store = createFolderTestStore()
    const member = makeWorktree({
      id: 'repo1::/tmp/worktree-1',
      repoId: 'repo1',
      worktreeFolderId: 'folder-a'
    })
    store.setState({
      repos: [{ ...repo1, worktreeFolders: [folderFixture('folder-a')] }],
      worktreesByRepo: { repo1: [member] }
    } as Partial<AppState>)
    // Once: the module-level default (resolve) must survive for later tests.
    vi.mocked(mockApi.worktrees.updateMeta).mockRejectedValueOnce(new Error('persist failed'))

    expect(await store.getState().deleteWorktreeFolder('repo1', 'folder-a')).toBe(false)
    // Unfile-first contract: the record survives, so the (reverted) membership
    // still names an existing folder instead of a deleted id.
    expect(store.getState().repos[0].worktreeFolders?.map((folder) => folder.id)).toEqual([
      'folder-a'
    ])
    expect(store.getState().worktreesByRepo.repo1[0].worktreeFolderId).toBe('folder-a')
    expect(updateRepoMockOf(store)).not.toHaveBeenCalled()
  })

  it("deleting one host's folder never unfiles the same-id folder's members on another host", async () => {
    const store = createFolderTestStore()
    const sshRepo: Repo = {
      ...repo1,
      executionHostId: 'ssh:beta',
      worktreeFolders: [folderFixture('folder-a')]
    }
    const localMember = makeWorktree({
      id: 'repo1::/tmp/worktree-1',
      repoId: 'repo1',
      worktreeFolderId: 'folder-a'
    })
    const sshMember = makeWorktree({
      id: 'repo1::/tmp/worktree-2',
      repoId: 'repo1',
      path: '/tmp/worktree-2',
      hostId: 'ssh:beta',
      worktreeFolderId: 'folder-a'
    })
    store.setState({
      repos: [{ ...repo1, worktreeFolders: [folderFixture('folder-a')] }, sshRepo],
      worktreesByRepo: { repo1: [localMember, sshMember] }
    } as Partial<AppState>)

    expect(
      await store.getState().deleteWorktreeFolder('repo1', 'folder-a', { hostId: 'local' })
    ).toBe(true)

    const [local, ssh] = store.getState().worktreesByRepo.repo1
    expect(local.worktreeFolderId).toBeUndefined()
    expect(ssh.worktreeFolderId).toBe('folder-a')
    const unfiledIds = vi
      .mocked(mockApi.worktrees.updateMeta)
      .mock.calls.map(([args]) => (args as { worktreeId: string }).worktreeId)
    expect(unfiledIds).toEqual([localMember.id])
    // The other host's record keeps its folder too.
    expect(
      store
        .getState()
        .repos.find((candidate) => candidate.executionHostId === 'ssh:beta')
        ?.worktreeFolders?.map((folder) => folder.id)
    ).toEqual(['folder-a'])
  })
})

describe('worktree folder slice — paired-host capability gate (G4/G4a)', () => {
  it('capability-absent host: zero folder RPCs, state reverted, exactly one toast', async () => {
    stripFolderCapabilityFromStatus()
    const store = createFolderTestStore()
    const worktree = makeWorktree({
      id: 'repo1::/tmp/worktree-1',
      repoId: 'repo1',
      worktreeFolderId: 'folder-a'
    })
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      repos: [
        { ...repo1, worktreeFolders: [folderFixture('folder-a'), folderFixture('folder-b')] }
      ],
      worktreesByRepo: { repo1: [worktree] }
    } as Partial<AppState>)

    // Record write refused before updateRepo.
    expect(await store.getState().createWorktreeFolder('repo1', { name: 'folder-c' })).toBeNull()
    expect(updateRepoMockOf(store)).not.toHaveBeenCalled()
    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1)

    // Membership write refused before any optimistic state or RPC.
    vi.mocked(toast.error).mockClear()
    expect(await store.getState().setWorktreeFolderMembership([worktree.id], 'folder-b')).toBe(
      false
    )
    expect(store.getState().worktreesByRepo.repo1[0].worktreeFolderId).toBe('folder-a')
    const folderRpcMethods = runtimeEnvironmentCall.mock.calls
      .map(([args]) => (args as { method: string }).method)
      .filter((method) => method === 'worktree.set' || method === 'repo.update')
    expect(folderRpcMethods).toEqual([])
    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1)
    expect(mockApi.worktrees.updateMeta).not.toHaveBeenCalled()
  })

  it('capability-present host: the write proceeds over the runtime RPC', async () => {
    const store = createFolderTestStore()
    const worktree = makeWorktree({ id: 'repo1::/tmp/worktree-1', repoId: 'repo1' })
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-set',
      ok: true,
      result: { worktree: { ...worktree, worktreeFolderId: 'folder-a' } },
      _meta: { runtimeId: 'runtime-remote' }
    })
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      repos: [{ ...repo1, worktreeFolders: [folderFixture('folder-a')] }],
      worktreesByRepo: { repo1: [worktree] }
    } as Partial<AppState>)

    expect(await store.getState().setWorktreeFolderMembership([worktree.id], 'folder-a')).toBe(true)
    expect(store.getState().worktreesByRepo.repo1[0].worktreeFolderId).toBe('folder-a')
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'worktree.set',
        params: expect.objectContaining({ worktreeFolderId: 'folder-a' })
      })
    )
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled()

    const created = await store.getState().createWorktreeFolder('repo1', { name: 'folder-b' })
    expect(created).not.toBeNull()
    expect(updateRepoMockOf(store)).toHaveBeenCalledTimes(1)
  })

  it('a slow failure rollback does not clobber a newer successful write', async () => {
    // Write #1 (folder-a) fails AFTER write #2 (folder-b) already succeeded;
    // rolling #1 back to its pre-write snapshot would erase folder-b.
    const store = createFolderTestStore()
    const worktree = makeWorktree({ id: 'repo1::/tmp/worktree-1', repoId: 'repo1' })
    store.setState({
      repos: [
        { ...repo1, worktreeFolders: [folderFixture('folder-a'), folderFixture('folder-b')] }
      ],
      worktreesByRepo: { repo1: [worktree] }
    } as Partial<AppState>)

    let failFirst!: (error: Error) => void
    vi.mocked(mockApi.worktrees.updateMeta).mockImplementationOnce(
      () => new Promise((_resolve, reject) => (failFirst = reject))
    )

    const first = store.getState().setWorktreeFolderMembership([worktree.id], 'folder-a')
    await vi.waitFor(() => expect(failFirst).toBeTypeOf('function'))
    expect(await store.getState().setWorktreeFolderMembership([worktree.id], 'folder-b')).toBe(true)

    failFirst(new Error('slow failure'))
    expect(await first).toBe(false)
    // The newer write owns the state; the stale rollback is discarded.
    expect(store.getState().worktreesByRepo.repo1[0].worktreeFolderId).toBe('folder-b')
  })

  it('a failed membership persist reverts the optimistic write and toasts once', async () => {
    const store = createFolderTestStore()
    const worktree = makeWorktree({ id: 'repo1::/tmp/worktree-1', repoId: 'repo1' })
    runtimeEnvironmentCall.mockRejectedValue(new Error('boom'))
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      repos: [{ ...repo1, worktreeFolders: [folderFixture('folder-a')] }],
      worktreesByRepo: { repo1: [worktree] }
    } as Partial<AppState>)

    expect(await store.getState().setWorktreeFolderMembership([worktree.id], 'folder-a')).toBe(
      false
    )
    expect(store.getState().worktreesByRepo.repo1[0].worktreeFolderId).toBeUndefined()
    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1)
  })
})
