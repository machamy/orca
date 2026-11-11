import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ClaudeManagedAccount,
  ClaudeRateLimitAccountsState
} from '../../shared/managed-account-types'
import type { ClaudeAccountSettings } from './claude-account-selection'
import { ClaudeAccountSelection } from './claude-account-selection'
import { ClaudeApiKeyAccounts } from './claude-api-key-account'
import {
  claudeApiKeyFile,
  claudeApiKeyHelperCommand,
  isAcceptableClaudeApiKey,
  writeClaudeApiKeyHelperSetting
} from './claude-api-key-store'

// Account removal and key storage must never reach the real Keychain.
vi.mock('../macos-keychain/generic-password', () => ({
  execSecurityCommand: async () => {
    throw new Error('The specified item could not be found in the keychain.')
  },
  isKeychainNotFoundError: () => true
}))

const KEY = 'sk-ant-api03-orcaForkTestKey_000000000000'
const roots: string[] = []
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'claude-api-key-'))
  roots.push(root)
  return root
}

function harness(platform: NodeJS.Platform = 'linux') {
  const root = tempRoot()
  const home = (id: string): string => join(root, id, 'home')
  let settings: ClaudeAccountSettings = {
    claudeManagedAccounts: [],
    activeClaudeManagedAccountId: null,
    activeClaudeManagedAccountIdsByRuntime: undefined
  }
  const store = {
    getSettings: () => settings,
    updateSettings: (patch: Partial<ClaudeAccountSettings>) => {
      settings = { ...settings, ...patch }
    }
  }
  const rateLimits = {
    evictInactiveClaudeCache: vi.fn(),
    refreshForClaudeAccountChange: vi.fn(async () => {
      throw new Error('unused')
    })
  }
  const runtimeAuth = {
    syncForCurrentSelection: vi.fn(async () => {}),
    publishAll: vi.fn(async () => {}),
    removeAccountFolder: vi.fn(async (id: string) => rmSync(join(root, id), { recursive: true })),
    prepareAccountFolder: vi.fn(async (id: string) => {
      mkdirSync(home(id), { recursive: true })
      return { configDir: home(id), readPath: home(id) }
    }),
    router: {
      accountHome: home,
      userConfigDir: () => join(root, 'personal'),
      systemDefaultHome: () => join(root, 'personal'),
      copiedLoginIntoSystemDefault: () => false,
      coveredBySystemDefault: () => false
    }
  }
  const selection = new ClaudeAccountSelection(store, rateLimits, runtimeAuth)
  const accounts = new ClaudeApiKeyAccounts({
    store,
    rateLimits,
    runtimeAuth,
    selection,
    platform
  })
  return { root, home, store, runtimeAuth, selection, accounts }
}

function onlyAccount(state: ClaudeRateLimitAccountsState) {
  expect(state.accounts).toHaveLength(1)
  return state.accounts[0]
}

describe('Claude API key accounts (fork)', () => {
  it('reads the key back through a helper command that never holds the key', () => {
    const mac = claudeApiKeyHelperCommand('acct-1', '/data/acct-1/home', 'darwin')
    expect(mac).toBe(
      "/usr/bin/security find-generic-password -s 'Orca Claude API key' -a 'acct-1' -w"
    )
    expect(claudeApiKeyHelperCommand('acct-1', "/data/it's/home", 'linux')).toBe(
      `cat '/data/it'\\''s/api-key'`
    )
    expect(claudeApiKeyHelperCommand('acct-1', 'C:\\data\\acct-1\\home', 'win32')).toContain(
      'type "'
    )
    for (const command of [mac, claudeApiKeyHelperCommand('acct-1', '/d/home', 'linux')]) {
      expect(command).not.toContain(KEY)
    }
  })

  it('accepts only key-shaped input, so the keychain command stays unquotable', () => {
    expect(isAcceptableClaudeApiKey(KEY)).toBe(true)
    expect(isAcceptableClaudeApiKey('short')).toBe(false)
    expect(isAcceptableClaudeApiKey(`${KEY}" -w "other`)).toBe(false)
    expect(isAcceptableClaudeApiKey(`${KEY}\nadd-generic-password`)).toBe(false)
  })

  it('adds the helper beside settings Claude already saved in the account folder', () => {
    const home = tempRoot()
    writeFileSync(join(home, 'settings.json'), JSON.stringify({ model: 'opus' }))

    writeClaudeApiKeyHelperSetting(home, 'cat /x')

    expect(JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8'))).toEqual({
      model: 'opus',
      apiKeyHelper: 'cat /x'
    })
  })

  it('saves a key as a host account that is ready to select', async () => {
    const h = harness()

    const account = onlyAccount(await h.accounts.add({ label: '  Team key ', apiKey: KEY }))

    expect(account).toMatchObject({
      email: 'Team key',
      authMethod: 'api-key',
      apiKeyHint: KEY.slice(-4),
      managedAuthRuntime: 'host'
    })
    expect(account.needsSignIn).toBeUndefined()
    expect(account.runsOnSystemDefault).toBeUndefined()
    const home = h.home(account.id)
    const keyFile = claudeApiKeyFile(home)
    expect(readFileSync(keyFile, 'utf8')).toBe(KEY)
    expect(statSync(keyFile).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')).apiKeyHelper).toBe(
      claudeApiKeyHelperCommand(account.id, home, 'linux')
    )
    expect(JSON.stringify(h.store.getSettings())).not.toContain(KEY)

    await expect(h.selection.select(account.id)).resolves.toMatchObject({
      activeAccountId: account.id
    })
  })

  it('refuses a malformed key before creating a folder', async () => {
    const h = harness()

    await expect(h.accounts.add({ label: 'Bad', apiKey: 'not a key' })).rejects.toThrow()
    await expect(h.accounts.add({ label: ' ', apiKey: KEY })).rejects.toThrow()

    expect(h.runtimeAuth.prepareAccountFolder).not.toHaveBeenCalled()
    expect(h.store.getSettings().claudeManagedAccounts).toEqual([])
  })

  it('deletes the folder again when the key cannot be stored', async () => {
    const h = harness()
    h.runtimeAuth.prepareAccountFolder.mockImplementationOnce(async (id: string) => ({
      configDir: join(h.root, id, 'missing', 'home'),
      readPath: join(h.root, id, 'missing', 'home')
    }))

    await expect(h.accounts.add({ label: 'Team', apiKey: KEY })).rejects.toThrow()

    expect(h.runtimeAuth.removeAccountFolder).toHaveBeenCalledTimes(1)
    expect(h.store.getSettings().claudeManagedAccounts).toEqual([])
  })

  it('never treats an API key account as signed out, even with no login in its folder', () => {
    const h = harness()
    const saved: ClaudeManagedAccount = {
      id: 'key',
      email: 'me@example.test',
      authMethod: 'api-key',
      managedAuthPath: h.home('key'),
      createdAt: 0,
      updatedAt: 0,
      lastAuthenticatedAt: 0
    }
    h.store.updateSettings({ claudeManagedAccounts: [saved] })

    expect(onlyAccount(h.selection.list())).toMatchObject({ authMethod: 'api-key' })
    expect(onlyAccount(h.selection.list()).needsSignIn).toBeUndefined()
  })
})
