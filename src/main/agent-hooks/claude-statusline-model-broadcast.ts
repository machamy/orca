import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import {
  AGENT_MODEL_BADGE_SNAPSHOT_CHANNEL,
  AGENT_MODEL_BADGE_STATUSLINE_CHANNEL,
  parseClaudeStatusLineModelBody,
  type ClaudeStatusLineModelReport
} from '../../shared/claude-statusline-model-badge'

// Why remember: the wrapper posts only on change, so a renderer that subscribes late
// (badge not mounted yet, or a reload) would otherwise wait for the next model switch.
const MAX_REMEMBERED_PANES = 500
const latestByPaneKey = new Map<string, ClaudeStatusLineModelReport>()
// Why on disk: Claude only reruns its statusline on activity, and pane keys survive an Orca
// restart (the daemon keeps the sessions), so an idle pane keeps its badge across a restart.
const PERSIST_DELAY_MS = 2000
let persistTimer: ReturnType<typeof setTimeout> | null = null

function persistPath(): string {
  return join(app.getPath('userData'), 'agent-model-badge-statusline.json')
}

function schedulePersist(): void {
  if (persistTimer) {
    return
  }
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      writeFileSync(persistPath(), JSON.stringify([...latestByPaneKey.values()]))
    } catch {
      // The badge falls back to hooks and the startup frame until the next statusline tick.
    }
  }, PERSIST_DELAY_MS)
}

function loadPersisted(): void {
  try {
    const parsed: unknown = JSON.parse(readFileSync(persistPath(), 'utf8'))
    for (const entry of Array.isArray(parsed) ? parsed : []) {
      const report = parseClaudeStatusLineModelBody(entry)
      if (report && !latestByPaneKey.has(report.paneKey)) {
        latestByPaneKey.set(report.paneKey, report)
      }
    }
  } catch {
    // Missing or unreadable: start empty.
  }
}

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
  schedulePersist()
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
  loadPersisted()
  ipcMain.removeHandler(AGENT_MODEL_BADGE_SNAPSHOT_CHANNEL)
  ipcMain.handle(AGENT_MODEL_BADGE_SNAPSHOT_CHANNEL, () => [...latestByPaneKey.values()])
}
