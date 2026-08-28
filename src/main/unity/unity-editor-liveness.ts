import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { unityEditorRecentlyLaunched } from './unity-recent-launch-stamp'

/** Unity's own project lock; created seconds AFTER start, removed on clean quit. */
export function editorLockfilePath(projectPath: string): string {
  return join(projectPath, 'Temp', 'UnityLockfile')
}

async function defaultListProcessCommands(): Promise<string> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const result = await promisify(execFile)('/bin/ps', ['-axo', 'command'], {
    maxBuffer: 8 * 1024 * 1024
  })
  return result.stdout
}

/**
 * Whether an editor session is LIVE on the project.
 *
 * Neither signal alone is enough. The lockfile outlives a crash (refusing on it
 * forever blocked seeding the worktree that crash had just orphaned), and it is
 * also created seconds AFTER the editor starts — so the process table is always
 * consulted, not only when a lockfile exists. The match is boundary-anchored:
 * plain substring matching made `feat` read as running whenever
 * `feature-anything` was, and any process quoting the flag in its arguments
 * (this session's own CLI prompt did exactly that) counted as an editor.
 */
export async function editorIsRunningOn(
  projectPath: string,
  listProcessCommands?: () => Promise<string>
): Promise<boolean> {
  if (unityEditorRecentlyLaunched(projectPath)) {
    return true
  }
  try {
    const commands = (await (listProcessCommands ?? defaultListProcessCommands)()).toLowerCase()
    const escaped = projectPath.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`unity[^\\n]*-projectpath ${escaped}(?=\\s|$)`).test(commands)
  } catch {
    // No process table, no verdict — fall back to the lockfile and refuse
    // toward safety when it is present.
    return existsSync(editorLockfilePath(projectPath))
  }
}
