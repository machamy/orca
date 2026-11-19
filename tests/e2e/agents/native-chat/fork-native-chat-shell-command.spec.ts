// `!cmd` in a Chat UI composer: the host runs it, the chat shows the output, no turn starts,
// and the agent reads the output once with the next message.

import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect } from '@stablyai/playwright-test'
import { test as base } from '../../desktop/electron-fixtures/orca-app'
import {
  SUPPORTED,
  claudeStubPath,
  openStubChat,
  type ClaudeStub
} from '../session-fixtures/structured-claude-stub'

// The shared fixture skips when a system claude sits on the login PATH; the chat here launches
// the stub by its absolute path, and the E2E home is signed out, so a stray real claude spends nothing.
const test = base.extend<{ claudeStub: ClaudeStub }>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixture callbacks require object destructuring here.
  claudeStub: async ({}, provideFixture) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-shell-command-'))
    const command = path.join(dir, 'claude')
    const launchLog = path.join(dir, 'launches.jsonl')
    const script = path.join(
      process.cwd(),
      'tests',
      'e2e',
      'fixtures',
      'structured-claude-stub.cjs'
    )
    const quote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`
    writeFileSync(
      command,
      `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(script)} ${quote(launchLog)} "$@"\n`
    )
    chmodSync(command, 0o755)
    await provideFixture({ command, launchLog, inputLog: path.join(dir, 'launches-inputs.jsonl') })
    rmSync(dir, { recursive: true, force: true })
  },
  launchEnv: async ({ claudeStub }, provideFixture) => {
    await provideFixture({ PATH: claudeStubPath(claudeStub) })
  }
})

function sentTexts(inputLog: string): string[] {
  if (!existsSync(inputLog)) {
    return []
  }
  return readFileSync(inputLog, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const message = JSON.parse(line) as { content?: unknown }
      const parts = Array.isArray(message.content) ? message.content : [message.content]
      return parts
        .map((part) =>
          typeof part === 'string' ? part : ((part as { text?: string } | null)?.text ?? '')
        )
        .join('\n')
    })
}

test.describe('native chat `!` shell commands', () => {
  test.skip(!SUPPORTED, 'the Claude stub wrapper is POSIX-only')

  test('runs on the host, then rides with the next message once', async ({
    orcaPage: page,
    claudeStub
  }) => {
    const { reply } = await openStubChat(page, claudeStub.command)
    const chat = page.locator('[data-native-chat-root="true"]')
    // The window follows the machine's language.
    const send = chat.getByRole('button', { name: /^(Send|보내기)$/ })

    await page.keyboard.type('!echo orca-shell-e2e && pwd')
    await page.keyboard.press('Enter')
    await expect(chat.getByText('$ echo orca-shell-e2e && pwd')).toBeVisible({ timeout: 30_000 })
    await expect(chat.getByText('orca-shell-e2e', { exact: false }).first()).toBeVisible()
    // No turn: the agent was sent nothing.
    expect(sentTexts(claudeStub.inputLog)).toEqual([])

    await page.keyboard.type('what did it print?')
    await send.click()
    await expect(reply).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => sentTexts(claudeStub.inputLog).length).toBe(1)
    const [carried] = sentTexts(claudeStub.inputLog)
    expect(carried).toContain('<orca-shell-commands>')
    expect(carried).toContain('$ echo orca-shell-e2e && pwd\norca-shell-e2e')
    expect(carried.trimEnd().endsWith('what did it print?')).toBe(true)
    // The person's own bubble keeps only their words.
    await expect(chat.getByText('<orca-shell-commands>', { exact: false })).toHaveCount(0)

    await page.keyboard.type('and now?')
    await send.click()
    await expect.poll(() => sentTexts(claudeStub.inputLog).length, { timeout: 30_000 }).toBe(2)
    expect(sentTexts(claudeStub.inputLog)[1]).not.toContain('orca-shell-commands')
  })
})
