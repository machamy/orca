import { randomUUID } from 'node:crypto'
import type { ClaudeRateLimitAccountsState } from '../../shared/managed-account-types'
import type {
  ClaudeAccountRuntime,
  ClaudeAccountSelection,
  ClaudeAccountStore,
  ClaudeAccountUsage
} from './claude-account-selection'
import {
  claudeApiKeyHelperCommand,
  deleteClaudeApiKey,
  isAcceptableClaudeApiKey,
  storeClaudeApiKey,
  writeClaudeApiKeyHelperSetting
} from './claude-api-key-store'

export type ClaudeApiKeyAccountRequest = { label: string; apiKey: string }

const MAX_LABEL_LENGTH = 60
const HOST_TARGET = { runtime: 'host' } as const

/** Fork: an Anthropic API key saved as a switchable Claude account in its own folder. */
export class ClaudeApiKeyAccounts {
  constructor(
    private readonly deps: {
      store: ClaudeAccountStore
      rateLimits: ClaudeAccountUsage
      runtimeAuth: ClaudeAccountRuntime
      selection: ClaudeAccountSelection
      platform?: NodeJS.Platform
    }
  ) {}

  async add(request: ClaudeApiKeyAccountRequest): Promise<ClaudeRateLimitAccountsState> {
    const label = request.label.trim()
    const apiKey = request.apiKey.trim()
    if (!label || label.length > MAX_LABEL_LENGTH) {
      throw new Error(`Name the key in 1 to ${MAX_LABEL_LENGTH} characters.`)
    }
    if (!isAcceptableClaudeApiKey(apiKey)) {
      throw new Error('That does not look like an Anthropic API key.')
    }
    const { store, rateLimits, runtimeAuth, selection } = this.deps
    const accountId = randomUUID()
    const folder = await runtimeAuth.prepareAccountFolder(accountId, HOST_TARGET)
    try {
      await storeClaudeApiKey(accountId, folder.readPath, apiKey, this.deps.platform)
      writeClaudeApiKeyHelperSetting(
        folder.readPath,
        claudeApiKeyHelperCommand(accountId, folder.readPath, this.deps.platform)
      )
    } catch (error) {
      await this.discard(accountId, folder.readPath)
      throw error
    }
    const now = Date.now()
    selection.saveSettings({
      claudeManagedAccounts: [
        ...store.getSettings().claudeManagedAccounts,
        {
          id: accountId,
          email: label,
          managedAuthPath: folder.readPath,
          managedAuthRuntime: 'host',
          wslDistro: null,
          wslLinuxAuthPath: null,
          authMethod: 'api-key',
          apiKeyHint: apiKey.slice(-4),
          createdAt: now,
          updatedAt: now,
          lastAuthenticatedAt: now
        }
      ]
    })
    rateLimits.evictInactiveClaudeCache(accountId)
    await runtimeAuth.syncForCurrentSelection(HOST_TARGET)
    return selection.list()
  }

  /** Removes the saved key after its account is gone; the folder removal already took a non-macOS key file. */
  async forget(accountId: string, accountHome: string): Promise<void> {
    await deleteClaudeApiKey(accountId, accountHome, this.deps.platform)
  }

  private async discard(accountId: string, accountHome: string): Promise<void> {
    await deleteClaudeApiKey(accountId, accountHome, this.deps.platform).catch(() => {})
    await this.deps.runtimeAuth
      .removeAccountFolder(accountId, HOST_TARGET)
      .catch((error: unknown) =>
        console.warn('[claude-accounts] Could not delete an unfinished API key folder:', error)
      )
  }
}
