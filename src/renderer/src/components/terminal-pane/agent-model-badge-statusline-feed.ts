import type { ClaudeStatusLineModelReport } from '../../../../shared/claude-statusline-model-badge'

// Fork: latest statusline model/effort per pane (see claude-statusline-model-badge.ts).
// Module-level because every pane reads it on its own poll; a store slice would re-render
// the app on each statusline change for a value only the badge reads.
const reportsByPaneKey = new Map<string, ClaudeStatusLineModelReport>()
let unsubscribe: (() => void) | null = null

/** Starts listening once per renderer; a no-op where the bridge is absent (web client). */
export function ensureAgentModelBadgeStatusLineFeed(): void {
  if (unsubscribe || typeof window === 'undefined') {
    return
  }
  const onStatusLine = window.api?.agentModelBadge?.onStatusLine
  if (!onStatusLine) {
    return
  }
  unsubscribe = onStatusLine((report) => {
    reportsByPaneKey.set(report.paneKey, report)
  })
}

export function readAgentModelBadgeStatusLine(
  paneKey: string
): ClaudeStatusLineModelReport | undefined {
  return reportsByPaneKey.get(paneKey)
}

export function recordAgentModelBadgeStatusLineForTests(
  report: ClaudeStatusLineModelReport | null
): void {
  if (report) {
    reportsByPaneKey.set(report.paneKey, report)
  } else {
    reportsByPaneKey.clear()
  }
}
