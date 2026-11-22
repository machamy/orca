import type {
  ClaudeManagedAccount,
  ClaudeManagedAccountSummary
} from '../../../shared/agent-accounts/managed-account-types'
import type { GlobalSettings } from '../../../shared/settings/global-settings-types'
import { getManagedAccountDisplayName } from '../../../shared/agent-accounts/managed-account-display-names'

/** The account summary from saved fields alone, before any login folder is read. */
export function savedClaudeAccountSummary(
  account: ClaudeManagedAccount,
  displayNames: GlobalSettings['managedAccountDisplayNames']
): ClaudeManagedAccountSummary {
  const displayName = getManagedAccountDisplayName(displayNames, 'claude', account.id)
  return {
    id: account.id,
    email: account.email,
    ...(displayName ? { displayName } : {}),
    managedAuthRuntime: account.managedAuthRuntime ?? 'host',
    wslDistro: account.wslDistro ?? null,
    authMethod: account.authMethod ?? 'unknown',
    ...(account.apiKeyHint ? { apiKeyHint: account.apiKeyHint } : {}),
    organizationUuid: account.organizationUuid ?? null,
    organizationName: account.organizationName ?? null,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    lastAuthenticatedAt: account.lastAuthenticatedAt
  }
}
