import { join } from 'node:path'
import { writeFileAtomically } from '../filesystem/atomic-file-publication'
import { readClaudeProfileObject } from './profiles/claude-profile-paths'

/** Claude reads an OAuth token only from its environment; settings `env` reaches it per account. */
const OAUTH_TOKEN_ENV = 'CLAUDE_CODE_OAUTH_TOKEN'

function envOf(settings: Record<string, unknown>): Record<string, unknown> {
  const env = settings.env
  return typeof env === 'object' && env !== null && !Array.isArray(env)
    ? (env as Record<string, unknown>)
    : {}
}

/** Fork: puts an OAuth token account's token in its own folder's settings, readable only by the user. */
export function writeClaudeOAuthTokenSetting(accountHome: string, token: string): void {
  const file = join(accountHome, 'settings.json')
  const current = readClaudeProfileObject(file)
  if (current.kind === 'unavailable' && !(current.error instanceof SyntaxError)) {
    throw new Error('Claude settings in the account folder are unreadable.')
  }
  const settings = current.kind === 'present' ? current.value : {}
  const env = { ...envOf(settings), [OAUTH_TOKEN_ENV]: token }
  writeFileAtomically(file, `${JSON.stringify({ ...settings, env }, null, 2)}\n`, { mode: 0o600 })
}

/** Fork: profile sync copies the personal `env` whole; an account's own token must outlive that. */
export function keepClaudeOAuthToken(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>
): Record<string, unknown> {
  const token = previous ? envOf(previous)[OAUTH_TOKEN_ENV] : undefined
  if (typeof token !== 'string' || envOf(next)[OAUTH_TOKEN_ENV] === token) {
    return next
  }
  return { ...next, env: { ...envOf(next), [OAUTH_TOKEN_ENV]: token } }
}

export function hasClaudeOAuthToken(settings: Record<string, unknown>): boolean {
  return typeof envOf(settings)[OAUTH_TOKEN_ENV] === 'string'
}
