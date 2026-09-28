import { ipcRenderer } from 'electron'
import {
  AGENT_MODEL_BADGE_SNAPSHOT_CHANNEL,
  AGENT_MODEL_BADGE_STATUSLINE_CHANNEL,
  type ClaudeStatusLineModelReport
} from '../../shared/claude-statusline-model-badge'

/** Fork: live Claude model/effort per pane, from the statusLine wrapper. */
export type AgentModelBadgeApi = {
  onStatusLine: (callback: (report: ClaudeStatusLineModelReport) => void) => () => void
  /** Last report per pane, for a renderer that subscribed after they arrived. */
  snapshot: () => Promise<ClaudeStatusLineModelReport[]>
}

export const agentModelBadgeApi: AgentModelBadgeApi = {
  onStatusLine: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, report: ClaudeStatusLineModelReport) =>
      callback(report)
    ipcRenderer.on(AGENT_MODEL_BADGE_STATUSLINE_CHANNEL, listener)
    return () => ipcRenderer.removeListener(AGENT_MODEL_BADGE_STATUSLINE_CHANNEL, listener)
  },
  snapshot: () => ipcRenderer.invoke(AGENT_MODEL_BADGE_SNAPSHOT_CHANNEL)
}
