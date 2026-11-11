import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeManagedAccount } from '../../shared/managed-account-types'
import { ClaudeProfileRouter, type ClaudeProfileRouterSettings } from './claude-profile-router'
import { claudeRoutedHomeAsync } from './claude-profile-routed-home'

vi.mock('@orca/process-host', () => ({ runProcess: vi.fn() }))
vi.mock('../codex-cli/command', () => ({ resolveClaudeCommand: () => '/unused-claude' }))
vi.mock('../startup/login-shell-environment', () => ({
  resolveLoginShellEnvironment: () => Promise.resolve({ CLAUDE_CONFIG_DIR: resolve('/shell/own') })
}))

const roots: string[] = []
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function routerWith(account: ClaudeManagedAccount) {
  const root = mkdtempSync(join(tmpdir(), 'claude-router-key-'))
  roots.push(root)
  const userHome = join(root, 'personal')
  mkdirSync(join(userHome, '.claude'), { recursive: true })
  const settings: ClaudeProfileRouterSettings = {
    claudeManagedAccounts: [account],
    activeClaudeManagedAccountId: account.id,
    activeClaudeManagedAccountIdsByRuntime: undefined,
    agentStatusHooksEnabled: false,
    disabledTuiAgents: []
  }
  const router = new ClaudeProfileRouter({
    getSettings: () => settings,
    dataRoot: join(root, 'data'),
    userHome,
    env: {},
    runSetup: () => new Promise(() => {}),
    refreshWaitMs: 500
  })
  return { router, userHome }
}

describe('Claude API key account routing (fork)', () => {
  it('keeps an API key account on its own folder when its name matches the System default login', async () => {
    const key: ClaudeManagedAccount = {
      id: 'key',
      email: 'me@example.test',
      authMethod: 'api-key',
      managedAuthPath: '/unused-legacy',
      createdAt: 0,
      updatedAt: 0,
      lastAuthenticatedAt: 0
    }
    const { router, userHome } = routerWith(key)
    writeFileSync(
      join(userHome, '.claude.json'),
      JSON.stringify({ oauthAccount: { emailAddress: 'me@example.test' } })
    )

    expect(router.coveredBySystemDefault('key')).toBe(false)
    expect(router.routedHome('identity')).toBe(router.accountHome('key'))
    await expect(claudeRoutedHomeAsync(router, 'identity')).resolves.toBe(router.accountHome('key'))
  })
})
