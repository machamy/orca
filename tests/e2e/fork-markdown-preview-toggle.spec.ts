/**
 * Fork release gate: a markdown file the rich editor refuses — raw HTML, prose
 * generics like `List<T>` outside code, more than 50k characters — must open in the
 * rendered Preview (GitHub-style) by default, from the in-pane toggle, not as a
 * "code mode only" dead end.
 *
 * ORCA_E2E_MARKDOWN_FIXTURE may name a real document to render instead of the
 * synthetic one; the screenshot lands in test-results for a visual check.
 */

import { copyFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { getActiveWorktreeContext, openMarkdownFixture } from './helpers/markdown-editor-fixture'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

function syntheticRefusedDoc(): string {
  const filler = Array.from(
    { length: 700 },
    (_, i) => `- 항목 ${i}: \`Build(input)\` 가 BuildResult { Plan, Skipped } 를 돌려준다.`
  ).join('\n')
  return [
    '# 게임 마무리 계획',
    '',
    'Rewards : List<MetaRewardDto> // prose generics trip the HTML detector',
    '',
    '<details><summary>접힌 섹션</summary>',
    '',
    '안쪽 내용',
    '',
    '</details>',
    '',
    '| 단계 | 설명 |',
    '| --- | --- |',
    '| 확정 | Capture 가 읽는다 |',
    '',
    '```csharp',
    'var x = new List<int>();',
    '```',
    '',
    filler
  ].join('\n')
}

test('a refused markdown doc opens in the rendered preview from the toggle', async ({
  orcaPage: page
}) => {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  const context = await getActiveWorktreeContext(page)
  const filePath = path.join(context.rootPath, 'fork-preview-fixture.md')
  const realFixture = process.env.ORCA_E2E_MARKDOWN_FIXTURE
  if (realFixture) {
    copyFileSync(realFixture, filePath)
  } else {
    writeFileSync(filePath, syntheticRefusedDoc())
  }

  try {
    await openMarkdownFixture(page, context, filePath)

    // Default: preview, rendered — not the rich editor's refusal banner.
    const preview = page.locator('.markdown-preview .markdown-body').first()
    await expect(preview).toBeVisible({ timeout: 15_000 })
    await expect(preview.locator('h1').first()).toBeVisible()
    await expect(page.getByText('코드 모드에서만')).toHaveCount(0)
    await expect(page.getByText('Editable only in code mode')).toHaveCount(0)

    // Radix ToggleGroup items: selection shows as aria-checked (TooltipTrigger owns data-state), the label as aria-label.
    // The E2E profile may run localized, so match either language.
    const previewToggle = page.getByLabel(/^(Preview|미리보기)$/).first()
    await expect(previewToggle).toHaveAttribute('aria-checked', 'true')

    if (!realFixture) {
      // GitHub-flavoured pieces render as elements, not as literal source.
      await expect(preview.locator('table')).toHaveCount(1)
      await expect(preview.locator('details')).toHaveCount(1)
      await expect(preview.locator('pre code')).toHaveCount(1)
    }
    await page.screenshot({ path: test.info().outputPath('markdown-preview.png'), fullPage: false })

    // The toggle still reaches source, and back.
    await page
      .getByLabel(/^(Source|소스)$/)
      .first()
      .click()
    await expect(page.locator('.markdown-preview .markdown-body')).toHaveCount(0)
    await previewToggle.click()
    await expect(page.locator('.markdown-preview .markdown-body').first()).toBeVisible()
  } finally {
    rmSync(filePath, { force: true })
  }
})
