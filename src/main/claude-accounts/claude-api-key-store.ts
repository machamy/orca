import { execFile } from 'node:child_process'
import { chmodSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { writeFileAtomically } from '../filesystem/atomic-file-publication'
import { execSecurityCommand, isKeychainNotFoundError } from '../macos-keychain/generic-password'
import { readClaudeProfileObject } from './profiles/claude-profile-paths'

/** Fork: where an API key account's key lives and how Claude's apiKeyHelper reads it back. */
export const CLAUDE_API_KEY_KEYCHAIN_SERVICE = 'Orca Claude API key'
const API_KEY_FILE = 'api-key'
const API_KEY_PATTERN = /^[A-Za-z0-9_-]{20,512}$/

export function isAcceptableClaudeApiKey(apiKey: string): boolean {
  return API_KEY_PATTERN.test(apiKey)
}

// Beside the account's Claude folder so Claude never reads or shares it; removing the account removes it.
export function claudeApiKeyFile(accountHome: string): string {
  return join(dirname(accountHome), API_KEY_FILE)
}

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/** The shell command Claude runs to get the key; never contains the key itself. */
export function claudeApiKeyHelperCommand(
  accountId: string,
  accountHome: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === 'darwin') {
    return `/usr/bin/security find-generic-password -s ${quotePosix(CLAUDE_API_KEY_KEYCHAIN_SERVICE)} -a ${quotePosix(accountId)} -w`
  }
  const file = claudeApiKeyFile(accountHome)
  return platform === 'win32' ? `type "${file}"` : `cat ${quotePosix(file)}`
}

// Via `security -i` so the key never shows up in another process's argument list.
function addKeychainPassword(accountId: string, apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      '/usr/bin/security',
      ['-i'],
      { timeout: 10_000 },
      (error, _out, stderr) =>
        error || String(stderr).trim()
          ? reject(error ?? new Error(String(stderr).trim()))
          : resolve()
    )
    child.stdin?.end(
      `add-generic-password -U -s "${CLAUDE_API_KEY_KEYCHAIN_SERVICE}" -a "${accountId}" -w "${apiKey}"\n`
    )
  })
}

export async function storeClaudeApiKey(
  accountId: string,
  accountHome: string,
  apiKey: string,
  platform: NodeJS.Platform = process.platform
): Promise<void> {
  if (!isAcceptableClaudeApiKey(apiKey)) {
    throw new Error('That does not look like an Anthropic API key.')
  }
  if (platform === 'darwin') {
    await addKeychainPassword(accountId, apiKey)
    return
  }
  const file = claudeApiKeyFile(accountHome)
  writeFileSync(file, apiKey, { mode: 0o600 })
  chmodSync(file, 0o600)
}

export async function deleteClaudeApiKey(
  accountId: string,
  accountHome: string,
  platform: NodeJS.Platform = process.platform
): Promise<void> {
  rmSync(claudeApiKeyFile(accountHome), { force: true })
  if (platform !== 'darwin') {
    return
  }
  try {
    await execSecurityCommand([
      'delete-generic-password',
      '-s',
      CLAUDE_API_KEY_KEYCHAIN_SERVICE,
      '-a',
      accountId
    ])
  } catch (error) {
    if (!isKeychainNotFoundError(error)) {
      throw error
    }
  }
}

/** Sets apiKeyHelper in the account's own settings; profile sync keeps keys the default home never set. */
export function writeClaudeApiKeyHelperSetting(accountHome: string, command: string): void {
  const file = join(accountHome, 'settings.json')
  const current = readClaudeProfileObject(file)
  if (current.kind === 'unavailable' && !(current.error instanceof SyntaxError)) {
    throw new Error('Claude settings in the account folder are unreadable.')
  }
  const settings = current.kind === 'present' ? current.value : {}
  writeFileAtomically(
    file,
    `${JSON.stringify({ ...settings, apiKeyHelper: command }, null, 2)}\n`,
    {
      mode: 0o600
    }
  )
}
