import {
  closeTestStores,
  testState,
  createStore,
  dataFile,
  writeDataFile,
  makeRepo
} from './persistence-test-harness'
import { makeTerminalTab } from './persistence-session-fixtures'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, rmSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getDefaultWorkspaceSession } from '../../shared/constants'
import { worktreeWorkspaceKey } from '../../shared/workspace-scope'
import { createProfileStateStore } from './profile-state/profile-state-store-factory'
import { hostWorktreeTarget } from '../../shared/worktree/host-qualified-identity'

const localTarget = (id: string) => hostWorktreeTarget({ id, hostId: 'local' })

const { loadUserSshConfigMock, sshConfigHostsToTargetsMock } = vi.hoisted(() => ({
  loadUserSshConfigMock: vi.fn(),
  sshConfigHostsToTargetsMock: vi.fn()
}))

vi.mock('../ssh/config/ssh-config-parser', () => ({
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

vi.mock('../telemetry/client', () => ({
  track: trackMock
}))

vi.mock('../telemetry/cohort-classifier', () => ({
  getCohortAtEmit: getCohortAtEmitMock
}))

describe('Store', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-test-'))
    trackMock.mockReset()
    getCohortAtEmitMock.mockReset()
    getCohortAtEmitMock.mockReturnValue({ nth_repo_added: 2 })
  })

  afterEach(async () => {
    await closeTestStores()
    rmSync(testState.dir, { recursive: true, force: true })
  })
  // Cohort on file existence so pre-telemetry profiles cannot default to opted in.

  it('retains the existing-user cohort when a corrupt legacy primary recovers from backup', async () => {
    await withRecoveredLegacyProfile((store) => {
      const telemetry = store.getSettings().telemetry
      expect(telemetry?.existedBeforeTelemetryRelease).toBe(true)
      expect(telemetry?.optedIn).toBeNull()
      expect(telemetry?.installId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )
      expect(store.getSettings().experimentalNewWorktreeCardStyle).toBe(false)
    })
  })

  it('retains inherited shortcut defaults across profile saves and pending cohort upgrades', async () => {
    writeDataFile({
      schemaVersion: 1,
      repos: [],
      worktreeMeta: {},
      ui: {},
      settings: { searchKeybindingSeed: 'pending' }
    })
    const store = await createStore()
    expect(store.getSettings().searchKeybindingSeed).toBe('legacy')
    expect(store.getSettings().tabSwitchKeybindingSeed).toBe('legacy')
    store.flush()
    await closeTestStores()
    const reopened = await createStore()
    expect(reopened.getSettings().searchKeybindingSeed).toBe('legacy')
  })

  it('excludes an unopened secondary profile with inherited telemetry from legacy shortcut rollouts', async () => {
    writeDataFile({
      settings: {
        telemetry: {
          optedIn: false,
          installId: 'shared-install',
          existedBeforeTelemetryRelease: true
        }
      }
    })
    const store = await createStore()
    expect(store.getSettings().tabSwitchKeybindingSeed).toBe('done')
    expect(store.getSettings().searchKeybindingSeed).toBe('done')
    expect(store.getSettings().nonMacSearchKeybindingSeed).toBe('done')
    await closeTestStores()
    const reopened = await createStore()
    expect(reopened.getSettings().searchKeybindingSeed).toBe('done')
    expect(reopened.getSettings().nonMacSearchKeybindingSeed).toBe('done')
  })

  it('keeps profiles created after the Mac rollout in the legacy non-Mac search cohort', async () => {
    writeDataFile({
      schemaVersion: 1,
      repos: [],
      worktreeMeta: {},
      ui: {},
      settings: { searchKeybindingSeed: 'done' }
    })
    const store = await createStore()
    expect(store.getSettings().nonMacSearchKeybindingSeed).toBe('legacy')
    store.flush()
    await closeTestStores()
    const reopened = await createStore()
    expect(reopened.getSettings().searchKeybindingSeed).toBe('done')
    expect(reopened.getSettings().nonMacSearchKeybindingSeed).toBe('legacy')
  })
})

describe('Store.migrateWorktreeIdentity', () => {
  const OLD = 'repo1::/ws/cunner'
  const NEW = 'repo1::/ws/worktree-creation-spinner'

  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-test-'))
  })

  afterEach(async () => {
    await closeTestStores()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  // The default-worktree switch does not rename one worktree; it EXCHANGES two,
  // as three re-keys through a throwaway id. Every step overwrites its
  // destination unguarded, so this pins that no side loses its tabs.
  it("exchanges two worktrees' tabs through the temp id without losing either side", async () => {
    const store = await createStore()
    const A = 'repo1::/ws/alpha'
    const B = 'repo1::/ws/beta'
    const TEMP = 'repo1::/ws/.orca-default-switch-11111111-2222-3333-4444-555555555555'
    store.setWorkspaceSession({
      ...getDefaultWorkspaceSession(),
      activeRepoId: 'repo1',
      activeWorkspaceKey: worktreeWorkspaceKey(A),
      activeWorktreeId: A,
      activeTabId: 'a1',
      tabsByWorktree: {
        [A]: [makeTerminalTab({ id: 'a1', worktreeId: A })],
        [B]: [
          makeTerminalTab({ id: 'b1', worktreeId: B }),
          makeTerminalTab({ id: 'b2', worktreeId: B })
        ]
      }
    })

    // A -> TEMP, B -> A, TEMP -> B (exactly what RuntimeDefaultWorktree emits).
    store.migrateWorktreeIdentity(localTarget(A), TEMP)
    store.migrateWorktreeIdentity(localTarget(B), A)
    store.migrateWorktreeIdentity(localTarget(TEMP), B)

    const tabs = store.getWorkspaceSession().tabsByWorktree ?? {}
    expect(tabs[A]?.map((tab) => tab.id)).toEqual(['b1', 'b2'])
    expect(tabs[B]?.map((tab) => tab.id)).toEqual(['a1'])
    expect(tabs[TEMP]).toBeUndefined()
    // Every tab still belongs to the worktree it now lives under.
    expect(tabs[A]?.every((tab) => tab.worktreeId === A)).toBe(true)
    expect(tabs[B]?.every((tab) => tab.worktreeId === B)).toBe(true)
  })

  // Why: `moveKey`/`moveSessionKey` assign into the destination without checking
  // it, so anything already there is discarded with no error and no log line.
  it("does not discard the destination worktree's tabs on a colliding re-key", async () => {
    const store = await createStore()
    const A = 'repo1::/ws/alpha'
    const B = 'repo1::/ws/beta'
    store.setWorkspaceSession({
      ...getDefaultWorkspaceSession(),
      activeRepoId: 'repo1',
      activeWorkspaceKey: worktreeWorkspaceKey(A),
      activeWorktreeId: A,
      activeTabId: 'a1',
      tabsByWorktree: {
        [A]: [makeTerminalTab({ id: 'a1', worktreeId: A })],
        [B]: [makeTerminalTab({ id: 'b1', worktreeId: B })]
      }
    })

    store.migrateWorktreeIdentity(localTarget(A), B)

    const tabs = store.getWorkspaceSession().tabsByWorktree ?? {}
    const ids = (tabs[B] ?? []).map((tab) => tab.id).sort()
    expect(ids).toEqual(['a1', 'b1'])
  })

  // Fork: a restart must not hydrate the swapped workspace pointing at the other checkout.
  it('remaps the active file path into the new worktree home', async () => {
    const store = await createStore()
    store.setWorkspaceSession({
      ...getDefaultWorkspaceSession(),
      activeRepoId: 'repo1',
      activeWorkspaceKey: worktreeWorkspaceKey(OLD),
      activeWorktreeId: OLD,
      activeFileIdByWorktree: { [OLD]: '/ws/cunner/a.ts' }
    })

    store.migrateWorktreeIdentity(localTarget(OLD), NEW)

    const session = store.getWorkspaceSession()
    expect(session.activeFileIdByWorktree?.[OLD]).toBeUndefined()
    expect(session.activeFileIdByWorktree?.[NEW]).toBe('/ws/worktree-creation-spinner/a.ts')
  })

  it('moves persisted mobile selections across reloads', async () => {
    const store = await createStore()
    // Register the repo so orphan cleanup does not discard the fixture on reload.
    store.addRepo(makeRepo({ id: 'repo1', path: '/repo1' }))
    store.setMobileClientTabSelections({
      'device-a': {
        [OLD]: { activeTabId: 'tab-1', activeGroupId: null, activeTabIdByGroupId: {} }
      }
    })

    store.migrateWorktreeIdentity(hostWorktreeTarget({ id: OLD, hostId: 'local' }), NEW)
    store.flush()

    expect(store.getMobileClientTabSelections()['device-a']?.[OLD]).toBeUndefined()
    const reloaded = await createStore()
    expect(reloaded.getMobileClientTabSelections()['device-a']?.[NEW]?.activeTabId).toBe('tab-1')
  })

  it('keeps the newest visit timestamp when a partial migration left both identities', async () => {
    const store = await createStore()
    store.setWorkspaceSession({
      ...getDefaultWorkspaceSession(),
      lastVisitedAtByWorktreeId: { [OLD]: 100, [NEW]: 900 }
    })

    store.migrateWorktreeIdentity(hostWorktreeTarget({ id: OLD, hostId: 'local' }), NEW)

    expect(store.getWorkspaceSession().lastVisitedAtByWorktreeId?.[OLD]).toBeUndefined()
    expect(store.getWorkspaceSession().lastVisitedAtByWorktreeId?.[NEW]).toBe(900)
  })
})

async function withRecoveredLegacyProfile(
  verify: (store: ReturnType<typeof createProfileStateStore>['store']) => void
): Promise<void> {
  writeDataFile({ schemaVersion: 1, repos: [], worktreeMeta: {}, settings: {}, ui: {} })
  writeFileSync(`${dataFile()}.bak.0`, readFileSync(dataFile()))
  writeFileSync(dataFile(), '{{{corrupt json')
  const { store } = createProfileStateStore({
    dataFile: dataFile(),
    databaseFile: join(testState.dir, 'profile-state.db'),
    profileId: 'cohort-recovery'
  })
  try {
    verify(store)
  } finally {
    await store.freezeWritesAsync()
  }
}
