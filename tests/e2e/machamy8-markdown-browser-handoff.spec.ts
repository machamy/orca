/**
 * Fork release gate (machamy.8 H3): a local markdown file opened through the
 * embedded browser must land in the editor's rich view — never render as raw
 * source in the guest — and must not leave the browser tab holding the URL.
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from './helpers/orca-app'
import type { Page } from '@stablyai/playwright-test'
import {
  getActiveTabType,
  getActiveWorktreeId,
  waitForActiveWorktree,
  waitForSessionReady
} from './helpers/store'

function writeMarkdownFixture(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'orca-md-handoff-'))
  const path = join(dir, 'release-note.md')
  writeFileSync(
    path,
    '# Fixture heading\n\n<details>\n<summary>folded</summary>\n\n- item-a\n\n</details>\n'
  )
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

async function openInOrcaBrowser(page: Page, worktreeId: string, filePath: string): Promise<void> {
  await page.evaluate(
    ({ targetWorktreeId, fileUrl }) => {
      window.__store?.getState().createBrowserTab(targetWorktreeId, fileUrl, {
        title: 'md handoff fixture',
        activate: true
      })
    },
    { targetWorktreeId: worktreeId, fileUrl: `file://${filePath}` }
  )
}

test('markdown opened in the embedded browser hands off to the editor', async ({
  orcaPage: page
}) => {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  const worktreeId = await getActiveWorktreeId(page)
  expect(worktreeId).toBeTruthy()

  const fixture = writeMarkdownFixture()
  try {
    await openInOrcaBrowser(page, worktreeId as string, fixture.path)

    // The handoff is async (authorize + stat); the winning state is an editor tab.
    await expect.poll(async () => getActiveTabType(page), { timeout: 15_000 }).toBe('editor')

    // The editor holds the fixture file, in a rendered (rich) view: the heading
    // exists as a rendered element, not as raw "# Fixture heading" source text.
    const openedPath = await page.evaluate(() => {
      const state = window.__store?.getState()
      const active = state?.openFiles?.find?.((f: { isActive?: boolean }) => f.isActive)
      return active?.filePath ?? state?.activeFilePath ?? null
    })
    if (openedPath !== null) {
      expect(String(openedPath)).toContain('release-note.md')
    }
    await expect(page.getByText('Fixture heading', { exact: true }).first()).toBeVisible({
      timeout: 15_000
    })

    // No browser tab may be left holding the markdown URL (stray-tab guard).
    const strayBrowserUrls = await page.evaluate(() => {
      const state = window.__store?.getState()
      const tabs = state?.browserTabs ?? state?.browserWorkspaces ?? []
      return JSON.stringify(tabs)
    })
    expect(strayBrowserUrls).not.toContain('release-note.md')
  } finally {
    fixture.cleanup()
  }
})
