import { BrowserWindow } from 'electron'
import {
  AGENT_MODEL_BADGE_STATUSLINE_CHANNEL,
  type ClaudeStatusLineModelReport
} from '../../shared/claude-statusline-model-badge'

// Fork: hands a pane's statusline model/effort to every renderer for the pane badge.
export function broadcastClaudeStatusLineModel(report: ClaudeStatusLineModelReport): void {
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
