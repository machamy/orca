import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { testState, createStore } from './persistence-test-harness'
import { mergeWorktree } from './ipc/worktree-metadata-merge'
import type { GitWorktreeInfo } from '../shared/worktree/types'

// Stub the ~/.ssh/config parser so the Store never reads the operator's actual ~/.ssh/config.
const { loadUserSshConfigMock, sshConfigHostsToTargetsMock } = vi.hoisted(() => ({
  loadUserSshConfigMock: vi.fn(),
  sshConfigHostsToTargetsMock: vi.fn()
}))

vi.mock('./ssh/ssh-config-parser', () => ({
  loadUserSshConfig: loadUserSshConfigMock,
  sshConfigHostsToTargets: sshConfigHostsToTargetsMock
}))

const { trackMock, getCohortAtEmitMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
  getCohortAtEmitMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.dir
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => {
      const decoded = ciphertext.toString('utf-8')
      if (!decoded.startsWith('encrypted:')) {
        throw new Error('invalid ciphertext')
      }
      return decoded.slice('encrypted:'.length)
    }
  }
}))

vi.mock('./telemetry/client', () => ({
  track: trackMock
}))

vi.mock('./telemetry/cohort-classifier', () => ({
  getCohortAtEmit: getCohortAtEmitMock
}))

function gitInfo(path: string): GitWorktreeInfo {
  return {
    path,
    head: 'abc123',
    branch: 'refs/heads/feature-a',
    isBare: false,
    isMainWorktree: false
  }
}

// Membership lives on WorktreeMeta precisely so `moveKey` carries it; an id list
// on the folder record would need its own migration on both paths below.
describe('worktree folder membership across worktree identity changes', () => {
  const DEFAULT = 'repo1::/ws/repo1'
  const SIDE = 'repo1::/ws/feature-a'
  const TEMP = 'repo1::/ws/.orca-default-switch-11111111-2222-3333-4444-555555555555'

  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-test-'))
    trackMock.mockReset()
    getCohortAtEmitMock.mockReset()
    getCohortAtEmitMock.mockReturnValue({ nth_repo_added: 2 })
  })

  afterEach(() => {
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('follows a worktree through a rename', async () => {
    const store = await createStore()
    const renamed = 'repo1::/ws/feature-a-renamed'
    store.setWorktreeMeta(SIDE, { displayName: 'feature-a', worktreeFolderId: 'folder-a' })

    store.migrateWorktreeIdentity(SIDE, renamed)

    expect(store.getWorktreeMeta(SIDE)).toBeUndefined()
    expect(store.getWorktreeMeta(renamed)?.worktreeFolderId).toBe('folder-a')
  })

  it('follows the workspace through a default switch, displaced one unfiled', async () => {
    const store = await createStore()
    store.setWorktreeMeta(DEFAULT, { displayName: 'repo1' })
    store.setWorktreeMeta(SIDE, { displayName: 'feature-a', worktreeFolderId: 'folder-a' })

    // DEFAULT -> TEMP, SIDE -> DEFAULT, TEMP -> SIDE (what RuntimeDefaultWorktree emits).
    store.migrateWorktreeIdentity(DEFAULT, TEMP)
    store.migrateWorktreeIdentity(SIDE, DEFAULT)
    store.migrateWorktreeIdentity(TEMP, SIDE)

    // The filed workspace took the default checkout's id and kept its folder.
    expect(store.getWorktreeMeta(DEFAULT)?.displayName).toBe('feature-a')
    expect(store.getWorktreeMeta(DEFAULT)?.worktreeFolderId).toBe('folder-a')
    // The workspace it displaced moved to the side id and is unfiled, as it was.
    expect(store.getWorktreeMeta(SIDE)?.displayName).toBe('repo1')
    expect(store.getWorktreeMeta(SIDE)?.worktreeFolderId).toBeUndefined()
    expect(store.getWorktreeMeta(TEMP)).toBeUndefined()
  })

  it('clears membership when the update carries an explicit undefined', async () => {
    const store = await createStore()
    store.setWorktreeMeta(SIDE, { displayName: 'feature-a', worktreeFolderId: 'folder-a' })

    store.setWorktreeMeta(SIDE, { worktreeFolderId: undefined })

    expect(store.getWorktreeMeta(SIDE)?.worktreeFolderId).toBeUndefined()
    expect(store.getWorktreeMeta(SIDE)?.displayName).toBe('feature-a')
  })

  it('projects membership onto the merged worktree, and absent reads as unfiled', async () => {
    const store = await createStore()
    store.setWorktreeMeta(SIDE, { displayName: 'feature-a', worktreeFolderId: 'folder-a' })

    const filed = mergeWorktree('repo1', gitInfo('/ws/feature-a'), store.getWorktreeMeta(SIDE))
    const unknown = mergeWorktree('repo1', gitInfo('/ws/feature-b'), undefined)

    expect(filed.worktreeFolderId).toBe('folder-a')
    expect('worktreeFolderId' in unknown).toBe(false)
  })
})
