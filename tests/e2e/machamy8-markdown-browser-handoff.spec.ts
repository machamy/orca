/**
 * Fork release gate (machamy.8 H3): a local markdown file opened through the
 * embedded browser must land in the editor's rich view — never render as raw
 * source in the guest — and must not leave the browser tab holding the URL.
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from '@stablyai/playwright-test'
import { test } from './desktop/electron-fixtures/orca-app'
import type { Page } from '@stablyai/playwright-test'
import {
  getActiveTabType,
  getActiveWorktreeId,
  waitForActiveWorktree,
  waitForSessionReady
} from './desktop/renderer-probes/store'

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
      const active = state?.openFiles.find((f) => f.id === state.activeFileId)
      return active?.filePath ?? null
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
      return JSON.stringify(state?.browserPagesByWorkspace ?? {})
    })
    expect(strayBrowserUrls).not.toContain('release-note.md')
  } finally {
    fixture.cleanup()
  }
})

// Mirror FLOATING_TERMINAL_WORKTREE_ID without loading renderer/shared modules into Playwright.
const FLOATING_WORKTREE_ID = 'global-floating-terminal'

test('markdown opened in the floating browser hands off while a project is active', async ({
  orcaPage: page
}) => {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await page.evaluate(async () => {
    const store = window.__store!
    await store.getState().updateSettings({ floatingTerminalEnabled: true })
    store.setState({ floatingWorkspacePanelOpen: true })
  })
  await expect(page.locator('[data-floating-terminal-panel][aria-hidden="false"]')).toBeVisible()

  const fixture = writeMarkdownFixture()
  try {
    await openInOrcaBrowser(page, FLOATING_WORKTREE_ID, fixture.path)

    await expect
      .poll(
        async () =>
          page.evaluate(
            (floatingId) =>
              window.__store
                ?.getState()
                .openFiles.some(
                  (file) =>
                    file.worktreeId === floatingId && file.filePath.endsWith('release-note.md')
                ) ?? false,
            FLOATING_WORKTREE_ID
          ),
        { timeout: 15_000 }
      )
      .toBe(true)
    const strayBrowserUrls = await page.evaluate(() =>
      JSON.stringify(window.__store?.getState().browserPagesByWorkspace ?? {})
    )
    expect(strayBrowserUrls).not.toContain('release-note.md')
  } finally {
    fixture.cleanup()
  }
})
