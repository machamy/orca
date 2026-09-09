/**
 * Fork release gate: the pane-corner model badge must render inside
 * the agent pane it describes, and its own menu must be reachable by right-click
 * and actually move it — the menu is the only in-place way to reposition it.
 */

import { expect, test } from './helpers/orca-app'
import type { Page } from '@stablyai/playwright-test'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { splitActiveTerminalPane, waitForPaneIdentitySnapshot } from './helpers/terminal'

type ActivePane = { tabId: string; leafId: string }

async function readActivePane(page: Page): Promise<ActivePane | null> {
  return page.evaluate(() => {
    const state = window.__store?.getState()
    const worktreeId = state?.activeWorktreeId
    if (!state || !worktreeId) {
      return null
    }
    for (const tab of state.tabsByWorktree?.[worktreeId] ?? []) {
      const layout = state.terminalLayoutsByTabId?.[tab.id]
      const leafId = layout?.activeLeafId ?? Object.keys(layout?.ptyIdsByLeafId ?? {})[0]
      if (leafId) {
        return { tabId: tab.id, leafId }
      }
    }
    return null
  })
}

/** Publishes the row a live Claude pane would publish; the badge reads `model`
 *  from it whenever the pane's own screen carries no Claude frame to scrape. */
async function reportClaudePane(
  page: Page,
  pane: ActivePane,
  model: string,
  effort?: string
): Promise<void> {
  await page.evaluate(
    ({ tabId, leafId, reportedModel, reportedEffort }) => {
      const store = window.__store
      const paneKey = `${tabId}:${leafId}`
      const now = Date.now()
      store?.setState({
        agentStatusByPaneKey: {
          ...store.getState().agentStatusByPaneKey,
          [paneKey]: {
            state: 'working',
            prompt: '',
            updatedAt: now,
            stateStartedAt: now,
            agentType: 'claude',
            model: reportedModel,
            ...(reportedEffort ? { effort: reportedEffort } : {}),
            paneKey,
            tabId,
            stateHistory: []
          }
        }
      })
    },
    { tabId: pane.tabId, leafId: pane.leafId, reportedModel: model, reportedEffort: effort }
  )
}

async function readBadgeCorner(page: Page): Promise<string | undefined> {
  return page.evaluate(() => window.__store?.getState().settings?.agentModelBadge?.corner)
}

test('the agent model badge renders in the pane and its menu moves it', async ({
  orcaPage: page
}) => {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)

  // The layout leaf lands after the worktree activates, so poll rather than
  // read once — the first pass routinely finds no leaf yet.
  await expect
    .poll(async () => (await readActivePane(page)) !== null, { timeout: 30_000 })
    .toBe(true)
  const pane = (await readActivePane(page)) as ActivePane
  await reportClaudePane(page, pane, 'opus', 'high')

  // The badge samples on a 3s poll, so give it more than one tick.
  // Model AND effort come from the pane's reported status row — the path that was
  // dropping Claude's object-shaped fields entirely.
  const badge = page.locator('button', { hasText: /^Opus · High$/ }).first()
  await expect(badge).toBeVisible({ timeout: 15_000 })

  // It must live inside the pane it describes, not float over the workspace.
  expect(await badge.evaluate((el) => el.closest('.pane') !== null)).toBe(true)

  await badge.click({ button: 'right' })
  await expect(page.getByText('Position', { exact: true })).toBeVisible({ timeout: 5_000 })

  await page.getByText('Top left', { exact: true }).click()
  await expect.poll(async () => readBadgeCorner(page), { timeout: 5_000 }).toBe('top-left')
  await expect(badge).toBeVisible()
})

test('a split gives each pane its own badge, inside that pane', async ({ orcaPage: page }) => {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await expect
    .poll(async () => (await readActivePane(page)) !== null, { timeout: 30_000 })
    .toBe(true)

  await splitActiveTerminalPane(page, 'vertical')
  const snapshot = await waitForPaneIdentitySnapshot(page, 2)
  await reportClaudePane(page, { tabId: snapshot.tabId, leafId: snapshot.panes[0]!.leafId }, 'opus')
  await reportClaudePane(
    page,
    { tabId: snapshot.tabId, leafId: snapshot.panes[1]!.leafId },
    'haiku'
  )

  await expect(page.locator('button', { hasText: /^Opus$/ })).toHaveCount(1, { timeout: 15_000 })
  await expect(page.locator('button', { hasText: /^Haiku$/ })).toHaveCount(1, { timeout: 15_000 })

  // The real risk: `absolute` escaping to a positioned ancestor above the pane
  // would stack both badges in the tab's corner instead of each pane's own.
  const placements = await page.evaluate(() =>
    [...document.querySelectorAll('.pane')].map((pane) => {
      const badge = [...pane.querySelectorAll('button')].find((el) =>
        /^(Opus|Haiku)$/.test(el.textContent ?? '')
      )
      if (!badge) {
        return null
      }
      const paneRect = pane.getBoundingClientRect()
      const badgeRect = badge.getBoundingClientRect()
      return {
        label: badge.textContent,
        inside:
          badgeRect.left >= paneRect.left - 1 &&
          badgeRect.right <= paneRect.right + 1 &&
          badgeRect.top >= paneRect.top - 1 &&
          badgeRect.bottom <= paneRect.bottom + 1
      }
    })
  )
  expect(placements.filter(Boolean)).toHaveLength(2)
  for (const placement of placements) {
    expect(placement?.inside, `${placement?.label} badge escaped its pane`).toBe(true)
  }
})
