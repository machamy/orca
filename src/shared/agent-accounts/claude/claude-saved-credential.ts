/** Fork: Claude accounts that run on a pasted credential instead of a `claude login` sign-in. */
export type ClaudeSavedCredentialKind = 'api-key' | 'oauth-token'

const OAUTH_TOKEN_PREFIX = 'sk-ant-oat'

/** `claude setup-token` tokens start `sk-ant-oat`; anything else is read as an API key. */
export function claudeSavedCredentialKind(credential: string): ClaudeSavedCredentialKind {
  return credential.trim().startsWith(OAUTH_TOKEN_PREFIX) ? 'oauth-token' : 'api-key'
}

/** These accounts have no login to check, refresh or match against System default. */
export function usesSavedClaudeCredential(authMethod: string | undefined): boolean {
  return authMethod === 'api-key' || authMethod === 'oauth-token'
}
