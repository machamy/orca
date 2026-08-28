import { constants as fsConstants, existsSync } from 'node:fs'
import { copyFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { launchDetachedEditor, type EditorLauncher } from './detached-editor-launch'
import type { UnityRiderOpenResult } from '../../shared/unity-worktree'

/**
 * "Open in Rider" for Unity worktrees (fork feature).
 *
 * Rider needs the Unity-generated `.sln` for real Unity integration (play
 * button, log view, debugger attach) — opening the bare folder loses all of
 * that. But `.sln`/`.csproj` are gitignored and only appear after Unity has
 * opened the project once, so a fresh worktree has none. They are plain text
 * whose references are project-relative (csproj names) or machine-level (the
 * Unity install), so the default checkout's copies work verbatim in a sibling
 * worktree on the same machine — and Unity regenerates them on its next open
 * anyway, so a stale copy is harmless.
 */

/** macOS only, matching the seeding feature: direct install and JetBrains
 *  Toolbox 2.x locations. Elsewhere the menu item is hidden via status. */
export function findRiderAppPath(
  platform: NodeJS.Platform = process.platform,
  fileExists: (path: string) => boolean = existsSync
): string | null {
  if (platform !== 'darwin') {
    return null
  }
  for (const candidate of [
    '/Applications/Rider.app',
    join(homedir(), 'Applications', 'Rider.app')
  ]) {
    if (fileExists(candidate)) {
      return candidate
    }
  }
  return null
}

async function listRootEntries(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

async function findSolutionFile(projectPath: string): Promise<string | null> {
  // Sorted: readdir order is unspecified, and a project can hold a tooling sln
  // beside Unity's — the pick must at least be deterministic.
  const slns = (await listRootEntries(projectPath)).filter((entry) => entry.endsWith('.sln')).sort()
  if (slns.length === 0) {
    return null
  }
  // Unity names the solution after the project folder; prefer that one when
  // several exist (e.g. a copied source-named sln beside a regenerated one).
  const folderNamed = `${basename(projectPath)}.sln`
  return join(projectPath, slns.includes(folderNamed) ? folderNamed : (slns[0] as string))
}

/** One copy per worktree at a time: the seed's ride-along and a menu click can
 *  overlap, and Rider must not open a solution another copy is mid-writing. */
const solutionCopiesInFlight = new Map<string, Promise<boolean>>()

/**
 * Copy the source checkout's `.sln`/`.csproj` into a worktree that has no
 * solution yet. The sln is renamed to the worktree's folder name — Unity will
 * generate exactly that name later, so this avoids ending up with two slns.
 * Best-effort by design: a failed copy just means Rider opens the folder.
 */
export function copyUnitySolutionFiles(args: {
  sourcePath: string
  worktreePath: string
}): Promise<boolean> {
  const inFlight = solutionCopiesInFlight.get(args.worktreePath)
  if (inFlight) {
    return inFlight
  }
  const copy = copySolutionFilesNow(args).finally(() => {
    solutionCopiesInFlight.delete(args.worktreePath)
  })
  solutionCopiesInFlight.set(args.worktreePath, copy)
  return copy
}

async function copySolutionFilesNow(args: {
  sourcePath: string
  worktreePath: string
}): Promise<boolean> {
  if (await findSolutionFile(args.worktreePath)) {
    return false
  }
  const sourceSln = await findSolutionFile(args.sourcePath)
  if (!sourceSln) {
    return false
  }
  try {
    // csproj first, sln LAST and never overwriting (EXCL): the sln is the
    // commit marker — a failure mid-copy leaves no sln, so the next attempt
    // repairs instead of trusting a partial set. EXCL also keeps a csproj the
    // worktree already owns (or one Unity just generated) from being clobbered.
    for (const entry of await listRootEntries(args.sourcePath)) {
      if (entry.endsWith('.csproj')) {
        await copyFile(
          join(args.sourcePath, entry),
          join(args.worktreePath, entry),
          fsConstants.COPYFILE_EXCL
        ).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') {
            throw error
          }
        })
      }
    }
    await copyFile(
      sourceSln,
      join(args.worktreePath, `${basename(args.worktreePath)}.sln`),
      fsConstants.COPYFILE_EXCL
    )
    return true
  } catch {
    return false
  }
}

export async function openUnityProjectInRider(args: {
  worktreePath: string
  /** The repo default checkout — the sln donor when the worktree has none. */
  sourcePath?: string
  /** Test seams. */
  launch?: EditorLauncher
  riderAppPath?: string | null
}): Promise<UnityRiderOpenResult> {
  if (!existsSync(join(args.worktreePath, 'ProjectSettings', 'ProjectVersion.txt'))) {
    return { opened: false, reason: 'not_a_unity_project' }
  }
  const riderApp = args.riderAppPath !== undefined ? args.riderAppPath : findRiderAppPath()
  if (!riderApp) {
    return { opened: false, reason: 'rider_missing' }
  }
  let sln = await findSolutionFile(args.worktreePath)
  if (!sln && args.sourcePath) {
    await copyUnitySolutionFiles({ sourcePath: args.sourcePath, worktreePath: args.worktreePath })
    sln = await findSolutionFile(args.worktreePath)
  }
  const target = sln ?? args.worktreePath
  const launch = args.launch ?? launchDetachedEditor
  const launched = await launch('/usr/bin/open', ['-a', riderApp, target])
  if (!launched.ok) {
    return { opened: false, reason: 'launch_failed', detail: launched.detail }
  }
  return { opened: true, target: sln ? 'solution' : 'folder' }
}
