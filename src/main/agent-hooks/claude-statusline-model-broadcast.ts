import { BrowserWindow, ipcMain } from 'electron'
import {
  AGENT_MODEL_BADGE_SNAPSHOT_CHANNEL,
  AGENT_MODEL_BADGE_STATUSLINE_CHANNEL,
  type ClaudeStatusLineModelReport
} from '../../shared/claude-statusline-model-badge'

// Why remember: the wrapper posts only on change, so a renderer that subscribes late
// (badge not mounted yet, or a reload) would otherwise wait for the next model switch.
const MAX_REMEMBERED_PANES = 500
const latestByPaneKey = new Map<string, ClaudeStatusLineModelReport>()

// Fork: hands a pane's statusline model/effort to every renderer for the pane badge.
export function broadcastClaudeStatusLineModel(report: ClaudeStatusLineModelReport): void {
  latestByPaneKey.delete(report.paneKey)
  latestByPaneKey.set(report.paneKey, report)
  if (latestByPaneKey.size > MAX_REMEMBERED_PANES) {
    const oldest = latestByPaneKey.keys().next().value
    if (oldest !== undefined) {
      latestByPaneKey.delete(oldest)
    }
  }
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    try {
      window.webContents.send(AGENT_MODEL_BADGE_STATUSLINE_CHANNEL, report)
    } catch {
      // A renderer can disappear between isDestroyed() and send().
    }
  }
}

export function registerAgentModelBadgeSnapshotHandler(): void {
  ipcMain.removeHandler(AGENT_MODEL_BADGE_SNAPSHOT_CHANNEL)
  ipcMain.handle(AGENT_MODEL_BADGE_SNAPSHOT_CHANNEL, () => [...latestByPaneKey.values()])
}
