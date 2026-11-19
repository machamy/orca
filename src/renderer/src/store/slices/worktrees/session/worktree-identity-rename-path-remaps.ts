import type { AppState } from '../../../types'
import { remapPathInsideWorktreeRoot } from '../../../../../../shared/file-access/cross-platform-path'

type RootPair = { oldWorktreePath: string | undefined; newWorktreePath: string | undefined }

function remapInsideRoot({ oldWorktreePath, newWorktreePath }: RootPair, path: string) {
  return oldWorktreePath && newWorktreePath
    ? remapPathInsideWorktreeRoot(oldWorktreePath, newWorktreePath, path)
    : null
}

/** A default-worktree swap moves each tab's startupCwd into the tab's new home. */
export function remapStartupCwdUnderRoot<T extends { startupCwd?: string }>(
  roots: RootPair,
  value: T
): T {
  const remapped = value.startupCwd ? remapInsideRoot(roots, value.startupCwd) : null
  return remapped === null ? value : { ...value, startupCwd: remapped }
}

/** Expanded dirs are absolute paths; unmapped, the file tree renders fully collapsed after a swap. */
export function remapExpandedDirsUnderRoot(roots: RootPair, dirs: Set<string>): Set<string> {
  if (!roots.oldWorktreePath || !roots.newWorktreePath) {
    return dirs
  }
  return new Set([...dirs].map((dir) => remapInsideRoot(roots, dir) ?? dir))
}

/** Reopen-closed-tab loads filePath verbatim, so an unmapped path serves the other checkout's file. */
export function remapClosedEditorFilePathUnderRoot<T extends { filePath?: string }>(
  roots: RootPair,
  file: T
): T {
  const remapped = file.filePath ? remapInsideRoot(roots, file.filePath) : null
  return remapped === null ? file : { ...file, filePath: remapped }
}

/** Live agent rows attribute to the sidebar by worktreeId when the tab lookup misses; a stale id strands the chip on the swapped-away side. */
export function rekeyAgentStatusWorktree(
  s: AppState,
  oldWorktreeId: string,
  newWorktreeId: string
): Partial<AppState> {
  const moved = [...s.agentStatusByPaneKey]
    .filter(([, entry]) => entry.worktreeId === oldWorktreeId)
    .map(([paneKey, entry]) => [paneKey, { ...entry, worktreeId: newWorktreeId }] as const)
  if (moved.length === 0) {
    return {}
  }
  return {
    agentStatusByPaneKey: s.agentStatusByPaneKey.replace(moved),
    agentStatusEpoch: s.agentStatusEpoch + 1
  }
}
