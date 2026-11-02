import { registerAgentModelBadgeSnapshotHandler } from '../agent-hooks/claude-statusline-model-broadcast'
import { registerUnityWorktreeHandlers } from '../ipc/unity-worktree'

/** Fork: main-process IPC the fork adds, registered once at startup outside upstream's handler lists. */
export function registerForkIpcHandlers(): void {
  registerAgentModelBadgeSnapshotHandler()
  registerUnityWorktreeHandlers()
}
