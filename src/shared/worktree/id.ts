import { WORKTREE_ID_SEPARATOR } from '../pty-session-id-format'

export { WORKTREE_ID_SEPARATOR } from '../pty-session-id-format'

export type ParsedWorktreeId = {
  repoId: string
  worktreePath: string
}

export const FOLDER_WORKSPACE_INSTANCE_SEPARATOR = '::workspace:'
const FOLDER_WORKSPACE_INSTANCE_SUFFIX = new RegExp(
  `${FOLDER_WORKSPACE_INSTANCE_SEPARATOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[0-9a-f-]{36}$`
)

export function getRepoIdFromWorktreeId(worktreeId: string): string {
  const separatorIdx = worktreeId.indexOf(WORKTREE_ID_SEPARATOR)
  return separatorIdx === -1 ? worktreeId : worktreeId.slice(0, separatorIdx)
}

export function splitWorktreeId(worktreeId: string): ParsedWorktreeId | null {
  const separatorIdx = worktreeId.indexOf(WORKTREE_ID_SEPARATOR)
  if (separatorIdx === -1) {
    return null
  }
  return {
    repoId: worktreeId.slice(0, separatorIdx),
    worktreePath: worktreeId.slice(separatorIdx + WORKTREE_ID_SEPARATOR.length)
  }
}

export function splitWorktreeIdForFilesystem(worktreeId: string): ParsedWorktreeId | null {
  const parsed = splitWorktreeId(worktreeId)
  if (!parsed) {
    return null
  }
  return {
    repoId: parsed.repoId,
    // Why: folder projects can have multiple workspace sessions backed by the
    // same directory. Their IDs carry a UUID suffix, but filesystem callers
    // still need the real folder path as cwd/root.
    worktreePath: parsed.worktreePath.replace(FOLDER_WORKSPACE_INSTANCE_SUFFIX, '')
  }
}

export function getWorktreePathBasenameFromId(worktreeId: string): string | null {
  const parsed = splitWorktreeIdForFilesystem(worktreeId)
  const normalizedPath = parsed?.worktreePath.trim().replace(/[\\/]+$/g, '') ?? ''
  if (!normalizedPath) {
    return null
  }
  const basename = normalizedPath.split(/[\\/]/).findLast(Boolean)?.trim()
  return basename || null
}

/** Directory-name marker of the throwaway worktree id the default switch re-keys
 *  through. It never names a real worktree, so nothing should retain it. */
export const DEFAULT_SWITCH_TEMP_ID_MARKER = '.orca-default-switch-'

/**
 * True for the throwaway id the default-worktree switch routes session state
 * through. The marker names a whole path SEGMENT — matching it as a bare
 * substring would also condemn a real worktree whose path merely contains the
 * text, and that id is what keeps its persisted sessions in scope.
 */
export function isDefaultSwitchTempWorktreeId(worktreeId: string): boolean {
  // Why splitWorktreeId and not split().pop(): the separator may appear inside a
  // legal POSIX path, and pop() would then read a fragment as the whole path.
  const path = splitWorktreeId(worktreeId)?.worktreePath ?? worktreeId
  const segment = path.split(/[/\\]/).pop() ?? ''
  // The suffix is a uuid; requiring its shape keeps a real worktree that merely
  // starts with the same text from being dropped out of session scope.
  const suffix = segment.slice(DEFAULT_SWITCH_TEMP_ID_MARKER.length)
  return (
    segment.startsWith(DEFAULT_SWITCH_TEMP_ID_MARKER) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(suffix)
  )
}
