import type { BrowserPage } from './workspaces/browser-workspace-types'

export function getBrowserPageRuntimeEnvironmentId(
  page: Pick<BrowserPage, 'browserRuntimeEnvironmentId'>,
  inferredRuntimeEnvironmentId: string | null | undefined
): string | null {
  if (page.browserRuntimeEnvironmentId !== undefined) {
    return page.browserRuntimeEnvironmentId?.trim() || null
  }
  return inferredRuntimeEnvironmentId?.trim() || null
}
