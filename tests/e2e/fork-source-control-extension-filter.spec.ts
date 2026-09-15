/**
 * Fork release gate: the Source Control filter's extension mode. `.cs .json .md`
 * must show exactly those files — not `Foo.cs.meta`, `Foo.csproj` or `style.css`,
 * which a substring match drags in — and the review-preset chip must set that
 * query in one click and clear it on the next.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './helpers/orca-app'
import type { Page } from '@stablyai/playwright-test'
import { openSourceControl } from './helpers/source-control-ai-generation'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

const FIXTURES = [
  'Assets/Filter/Player.cs',
  'Assets/Filter/Player.cs.meta',
  'Assets/Filter/Filter.csproj',
  'Assets/Filter/style.css',
  'Assets/Filter/config.json',
  'Assets/Filter/README.md',
  'Assets/Filter/icon.png'
]

async function activeWorktreePath(page: Page, worktreeId: string): Promise<string> {
  const path = await page.evaluate((id) => {
    const state = window.__store?.getState()
    return Object.values(state?.worktreesByRepo ?? {})
      .flat()
      .find((entry: { id: string; path: string }) => entry.id === id)?.path
  }, worktreeId)
  if (!path) {
    throw new Error(`no path for worktree ${worktreeId}`)
  }
  return path
}

async function visibleFilterRows(page: Page): Promise<string[]> {
  // Uncommitted rows stamp their repo-relative path; only the fixture dir counts.
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-source-control-path]')]
      .map((el) => el.getAttribute('data-source-control-path') ?? '')
      .filter((p) => p.startsWith('Assets/Filter/'))
  )
}

test('extension filter shows only the listed extensions and the preset toggles it', async ({
  orcaPage: page
}) => {
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  const worktreePath = await activeWorktreePath(page, worktreeId)
  const fixtureDir = join(worktreePath, 'Assets', 'Filter')
  mkdirSync(fixtureDir, { recursive: true })
  for (const relative of FIXTURES) {
    writeFileSync(join(worktreePath, relative), `fixture ${relative}\n`)
  }

  try {
    await openSourceControl(page, worktreeId)
    // Untracked fixtures must surface before any filtering is judged.
    await expect
      .poll(async () => (await visibleFilterRows(page)).length, { timeout: 20_000 })
      .toBe(FIXTURES.length)

    await page.getByTestId('source-control-filter-toggle').click()
    const input = page.getByTestId('source-control-filter-input')
    await expect(input).toBeVisible()

    // One click on the preset chip sets the review query…
    const chip = page.getByRole('button', { name: '.cs .json .md' })
    await chip.click()
    await expect(input).toHaveValue('.cs .json .md')
    await expect
      .poll(async () => (await visibleFilterRows(page)).sort(), { timeout: 10_000 })
      .toEqual(
        ['Assets/Filter/Player.cs', 'Assets/Filter/config.json', 'Assets/Filter/README.md'].sort()
      )

    // …a bare `.cs` is a real extension, not a substring…
    await input.fill('.cs')
    await expect
      .poll(async () => visibleFilterRows(page), { timeout: 10_000 })
      .toEqual(['Assets/Filter/Player.cs'])

    // …and the chip clears its own query on the second click.
    await input.fill('.cs .json .md')
    await chip.click()
    await expect(input).toHaveValue('')
    await expect
      .poll(async () => (await visibleFilterRows(page)).length, { timeout: 10_000 })
      .toBe(FIXTURES.length)
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true })
  }
})
