import { existsSync } from 'node:fs'
import { readdir, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { cloneWorktreePathWithApfs } from '../ipc/worktree-apfs-clone'
import { launchDetachedEditor, type EditorLauncher } from './detached-editor-launch'
import { unityEditorBinaryPath } from './unity-editor-install-path'
import type { UnityProcessRow } from './unity-editor-process-lookup'
import { openExistingUnityEditorWindow, type FocusCommandRunner } from './unity-editor-window-focus'
import { copyUnitySolutionFiles, findRiderAppPath } from './unity-rider-open'
import { editorIsRunningOn, editorLockfilePath } from './unity-editor-liveness'
import {
  stampUnityEditorLaunch,
  unityLaunchStampStillBlocksRelaunch
} from './unity-recent-launch-stamp'
import { markFirebaseDesktopJsonUpToDate } from './unity-firebase-config-timestamps'
import { syncUnityWorktreeTint } from './unity-worktree-tint'
import type {
  UnityOpenResult,
  UnitySeedResult,
  UnityWorktreeStatus
} from '../../shared/unity-worktree'

/**
 * Per-worktree Unity support: seed the (gitignored) `Library` cache from the
 * repo's default checkout, and open a worktree in the right editor version.
 *
 * Why seeding exists: a fresh worktree has no `Library`, so Unity's first open
 * is a full reimport — tens of minutes for this repo's 7.6GB cache. An APFS
 * clone of the default checkout's Library takes seconds and shares blocks until
 * the sides diverge. Clone, not links: `ArtifactDB` is a mutable database that
 * two editors would corrupt through a shared file, and Unity's own project lock
 * lives under each worktree's `Temp/`, so nothing else prevents that.
 */
// Re-exported so existing callers keep one import site for project/editor paths.
export { unityEditorBinaryPath } from './unity-editor-install-path'

const PROJECT_VERSION_RELPATH = join('ProjectSettings', 'ProjectVersion.txt')

export async function readUnityEditorVersion(projectPath: string): Promise<string | null> {
  try {
    const raw = await readFile(join(projectPath, PROJECT_VERSION_RELPATH), 'utf-8')
    return /m_EditorVersion:\s*(\S+)/.exec(raw)?.[1] ?? null
  } catch {
    return null
  }
}

async function directoryHasEntries(path: string): Promise<boolean> {
  try {
    return (await readdir(path)).length > 0
  } catch {
    return false
  }
}

/**
 * Session-coupled files a clone must not carry: each names the SOURCE session's
 * process, port, or IDE handshake, and every one is regenerated on demand.
 * `com.singularitygroup.hotreload` additionally embeds the source's absolute
 * paths in its generated solution — a worktree editor patching the SOURCE tree
 * is precisely the cross-contamination this feature exists to prevent.
 */
const SESSION_COUPLED_LIBRARY_ENTRIES = [
  'EditorInstance.json',
  'ProtocolInstance.json',
  'ilpp.pid',
  'ArtifactDB-lock',
  'SourceAssetDB-lock',
  'com.singularitygroup.hotreload'
]

/** One seed per target at a time: two concurrent seeds interleaved their
 *  check/rm/clone steps and the loser's cleanup deleted the winner's output.
 *  Sources are tracked too, so "Open in Unity" on the default checkout cannot
 *  start an editor writing into the Library a clone is still reading. */
const seedsInFlight = new Set<string>()
const seedSourcesInFlight = new Set<string>()

export async function seedUnityWorktreeCache(args: {
  worktreePath: string
  sourcePath: string
  /** Fork: per-worktree editor colour (repo setting); undefined leaves it alone. */
  tint?: boolean
  /** Sibling worktree folder names, so tints avoid colliding. */
  tintSiblingLabels?: readonly string[]
  /** Manual colour choices (label → hex) from the worktree context menu. */
  tintOverridesByLabel?: Readonly<Record<string, string>>
  /** Test seam for the process-table probe. */
  listProcessCommands?: () => Promise<string>
}): Promise<UnitySeedResult> {
  const targetLibrary = join(args.worktreePath, 'Library')
  const sourceLibrary = join(args.sourcePath, 'Library')
  // Fixed name on purpose: the per-target lock makes it unique, and a crash's
  // leftover is swept by the next attempt instead of accumulating.
  const stagingLibrary = `${targetLibrary}.orca-seeding`
  if (process.platform !== 'darwin') {
    return { seeded: false, reason: 'cow_unsupported' }
  }
  // A deleted worktree must not be resurrected: the clone's mkdir would
  // recreate the vanished worktree root and fill it with an orphan Library.
  if (!existsSync(join(args.worktreePath, PROJECT_VERSION_RELPATH))) {
    return { seeded: false, reason: 'worktree_missing' }
  }
  if (seedsInFlight.has(targetLibrary)) {
    return { seeded: false, reason: 'seed_in_progress' }
  }
  seedsInFlight.add(targetLibrary)
  seedSourcesInFlight.add(args.sourcePath)
  try {
    // Never clone out of a live editor session: its Library databases are
    // mid-write, and the copy inherits import state referencing that session's
    // Temp staging — observed as a "Moving file failed" dialog and a crash on
    // the seeded worktree's first open.
    if (await editorIsRunningOn(args.sourcePath, args.listProcessCommands)) {
      return { seeded: false, reason: 'source_editor_running' }
    }
    // Nor into one: Unity would race the clone inside its own Library.
    if (await editorIsRunningOn(args.worktreePath, args.listProcessCommands)) {
      return { seeded: false, reason: 'target_editor_running' }
    }
    // Never overwrite: an existing Library may hold real import state.
    if (await directoryHasEntries(targetLibrary)) {
      return { seeded: false, reason: 'already_seeded' }
    }
    if (!(await directoryHasEntries(sourceLibrary))) {
      return { seeded: false, reason: 'source_missing' }
    }
    try {
      // Staged, then renamed: a partial clone must never wear the name
      // `Library` — the "already seeded" check would believe it, and Unity
      // would import against half a cache. The rename is atomic; a crash
      // leaves only the staging name behind.
      await rm(stagingLibrary, { recursive: true, force: true })
      await cloneWorktreePathWithApfs(sourceLibrary, stagingLibrary, true)
      // The gate passed BEFORE a clone that runs for seconds; an editor opened
      // on the source meanwhile has been writing under the clone's feet.
      if (await editorIsRunningOn(args.sourcePath, args.listProcessCommands)) {
        await rm(stagingLibrary, { recursive: true, force: true })
        return {
          seeded: false,
          reason: 'clone_failed',
          detail: 'the source editor started during the clone; discarded the copy'
        }
      }
      for (const entry of SESSION_COUPLED_LIBRARY_ENTRIES) {
        await rm(join(stagingLibrary, entry), { recursive: true, force: true })
      }
      await rm(targetLibrary, { recursive: true, force: true })
      await rename(stagingLibrary, targetLibrary)
      // The gitignored .sln/.csproj ride along so "Open in Rider" works before
      // Unity's first open. Best-effort: a failed copy must not fail the seed.
      await copyUnitySolutionFiles({
        sourcePath: args.sourcePath,
        worktreePath: args.worktreePath
      }).catch(() => false)
      // Firebase's regenerate-on-first-open has crashed the editor twice; when
      // the generated config already matches its source, mark it up to date.
      await markFirebaseDesktopJsonUpToDate(args.worktreePath).catch(() => false)
      if (args.tint !== undefined) {
        await syncUnityWorktreeTint({
          worktreePath: args.worktreePath,
          enabled: args.tint,
          ...(args.tintSiblingLabels ? { siblingLabels: args.tintSiblingLabels } : {}),
          ...(args.tintOverridesByLabel ? { overridesByLabel: args.tintOverridesByLabel } : {})
        }).catch(() => 'unchanged')
      }
      return { seeded: true }
    } catch (error) {
      let detail = error instanceof Error ? error.message : String(error)
      try {
        await rm(stagingLibrary, { recursive: true, force: true })
      } catch {
        detail += ' (staging output could not be removed and may remain)'
      }
      return { seeded: false, reason: 'clone_failed', detail }
    }
  } finally {
    seedsInFlight.delete(targetLibrary)
    seedSourcesInFlight.delete(args.sourcePath)
  }
}

export async function getUnityWorktreeStatus(args: {
  worktreePath: string
  sourcePath: string
}): Promise<UnityWorktreeStatus> {
  const editorVersion = await readUnityEditorVersion(args.worktreePath)
  if (editorVersion === null && !existsSync(join(args.worktreePath, PROJECT_VERSION_RELPATH))) {
    return {
      isUnityProject: false,
      editorVersion: null,
      editorInstalled: false,
      worktreeHasLibrary: false,
      sourceHasLibrary: false,
      riderInstalled: false
    }
  }
  return {
    isUnityProject: true,
    editorVersion,
    editorInstalled: editorVersion !== null && existsSync(unityEditorBinaryPath(editorVersion)),
    worktreeHasLibrary: await directoryHasEntries(join(args.worktreePath, 'Library')),
    sourceHasLibrary: await directoryHasEntries(join(args.sourcePath, 'Library')),
    riderInstalled: findRiderAppPath() !== null
  }
}

/** Two simultaneous opens both passed the editor lookup and double-launched;
 *  the second caller now rides the first's promise (same idiom as seedsInFlight). */
const opensInFlight = new Map<string, Promise<UnityOpenResult>>()

/** Launch the project's exact editor version, detached so the app's lifetime
 *  never owns Unity's. Missing version → open Unity Hub instead and say why. */
export async function openUnityProject(
  args: Parameters<typeof openUnityProjectExclusive>[0]
): Promise<UnityOpenResult> {
  const inFlight = opensInFlight.get(args.worktreePath)
  if (inFlight) {
    return inFlight
  }
  const run = openUnityProjectExclusive(args)
  opensInFlight.set(args.worktreePath, run)
  try {
    return await run
  } finally {
    opensInFlight.delete(args.worktreePath)
  }
}

async function openUnityProjectExclusive(args: {
  worktreePath: string
  /** Fork: per-worktree editor colour (repo setting); undefined leaves it alone. */
  tint?: boolean
  /** Sibling worktree folder names, so tints avoid colliding. */
  tintSiblingLabels?: readonly string[]
  /** Manual colour choices (label → hex) from the worktree context menu. */
  tintOverridesByLabel?: Readonly<Record<string, string>>
  launch?: EditorLauncher
  platform?: NodeJS.Platform
  /** Test seams for the already-open-editor path; nothing may spawn in tests. */
  listProcesses?: () => Promise<readonly UnityProcessRow[]>
  runFocusCommand?: FocusCommandRunner
  editorBinaryExists?: (binaryPath: string) => boolean
}): Promise<UnityOpenResult> {
  const launch = args.launch ?? launchDetachedEditor
  const platform = args.platform ?? process.platform
  const editorVersion = await readUnityEditorVersion(args.worktreePath)
  if (editorVersion === null) {
    return { opened: false, reason: 'not_a_unity_project' }
  }
  // The renderer's disabled state lives per menu instance; a second window (the
  // Agent Map popout) could open Unity onto a Library mid-clone, or onto the
  // SOURCE a clone is still reading. Main holds the truth.
  if (
    seedsInFlight.has(join(args.worktreePath, 'Library')) ||
    seedSourcesInFlight.has(args.worktreePath)
  ) {
    return { opened: false, reason: 'seed_in_progress', editorVersion }
  }
  // Before anything else about installs: an editor already holding this project
  // must be raised, never doubled. It also outranks `editor_missing` — a live
  // window is worth fronting even if that Hub version has since been removed.
  const existingWindow = await openExistingUnityEditorWindow({
    worktreePath: args.worktreePath,
    editorVersion,
    platform,
    ...(args.listProcesses ? { listProcesses: args.listProcesses } : {}),
    ...(args.runFocusCommand ? { runFocusCommand: args.runFocusCommand } : {})
  })
  if (existingWindow) {
    return existingWindow
  }
  // A launch this Orca performed seconds ago may not be in the process table
  // yet (the same window the seeding gate stamps for); launching again there
  // doubles the editor. No pid to focus, so report it like a windowless editor.
  // No process was found above, so a dead launch (no lockfile past the startup
  // grace) is allowed through instead of blocking for the stamp's full TTL.
  if (
    unityLaunchStampStillBlocksRelaunch(
      args.worktreePath,
      existsSync(editorLockfilePath(args.worktreePath))
    )
  ) {
    return {
      opened: false,
      reason: 'focus_failed',
      editorVersion,
      focusFailureReason: 'no_window',
      detail: 'this Orca launched the editor moments ago; it is still starting up'
    }
  }
  const binary = unityEditorBinaryPath(editorVersion, platform)
  if (!(args.editorBinaryExists ?? existsSync)(binary)) {
    // hubOpened is reported honestly: the UI used to claim "opened Unity Hub
    // instead" on every platform while only macOS ever tried.
    let hubOpened = false
    if (platform === 'darwin' && existsSync('/Applications/Unity Hub.app')) {
      hubOpened = (await launch('/usr/bin/open', ['-a', 'Unity Hub'])).ok
    }
    return { opened: false, reason: 'editor_missing', editorVersion, hubOpened }
  }
  await markFirebaseDesktopJsonUpToDate(args.worktreePath).catch(() => false)
  // Written before launch so the editor compiles it during its first import
  // instead of forcing a domain reload right after the window appears.
  if (args.tint !== undefined) {
    await syncUnityWorktreeTint({
      worktreePath: args.worktreePath,
      enabled: args.tint,
      ...(args.tintSiblingLabels ? { siblingLabels: args.tintSiblingLabels } : {}),
      ...(args.tintOverridesByLabel ? { overridesByLabel: args.tintOverridesByLabel } : {})
    }).catch(() => 'unchanged')
  }
  // The entry gate ran several awaits ago; a seed that began meanwhile would
  // have this launch and the seeder fighting over the live Library.
  if (
    seedsInFlight.has(join(args.worktreePath, 'Library')) ||
    seedSourcesInFlight.has(args.worktreePath)
  ) {
    return { opened: false, reason: 'seed_in_progress', editorVersion }
  }
  const launched = await launch(binary, ['-projectPath', args.worktreePath])
  if (!launched.ok) {
    return { opened: false, reason: 'launch_failed', editorVersion, detail: launched.detail }
  }
  stampUnityEditorLaunch(args.worktreePath)
  return { opened: true }
}

/**
 * Auto-seed after worktree creation (fork feature): a Unity repo's fresh
 * worktree gets its Library from the default checkout without anyone asking.
 *
 * Fire-and-forget by design — creation must not wait multi-seconds on a clone,
 * and a refusal is a normal outcome, not an error: the source editor may be
 * open (the gate that prevents the live-clone incident), the volume may not be
 * APFS, the repo may not be Unity at all. The context menu stays as the manual
 * path for every skipped case.
 */
export async function autoSeedUnityCacheAfterWorktreeCreate(args: {
  sourcePath: string
  worktreePath: string
  /** Fork: per-worktree editor colour (repo setting). */
  tint?: boolean
  /** Sibling worktree folder names, so tints avoid colliding. */
  tintSiblingLabels?: readonly string[]
  /** Manual colour choices (label → hex) from the worktree context menu. */
  tintOverridesByLabel?: Readonly<Record<string, string>>
  /** The repo's stored choice. undefined = never asked — offer instead of act. */
  decision?: boolean
  /** Invoked (at most once) when the choice has not been made yet and seeding
   *  would actually be possible — the renderer turns this into the question. */
  offer?: () => void
  onOutcome?: (outcome: UnitySeedResult | { seeded: false; reason: 'not_a_unity_project' }) => void
}): Promise<void> {
  try {
    if ((await readUnityEditorVersion(args.worktreePath)) === null) {
      args.onOutcome?.({ seeded: false, reason: 'not_a_unity_project' })
      return
    }
    if (args.decision === false) {
      return
    }
    if (args.decision === undefined) {
      // Only ask a question whose "yes" could work: macOS, a seedable source,
      // an unseeded target. Anything else would nag about the impossible.
      if (
        process.platform === 'darwin' &&
        (await directoryHasEntries(join(args.sourcePath, 'Library'))) &&
        !(await directoryHasEntries(join(args.worktreePath, 'Library')))
      ) {
        args.offer?.()
      }
      return
    }
    const result = await seedUnityWorktreeCache({
      worktreePath: args.worktreePath,
      sourcePath: args.sourcePath,
      ...(args.tint === undefined ? {} : { tint: args.tint }),
      ...(args.tintSiblingLabels ? { tintSiblingLabels: args.tintSiblingLabels } : {}),
      ...(args.tintOverridesByLabel ? { tintOverridesByLabel: args.tintOverridesByLabel } : {})
    })
    args.onOutcome?.(result)
  } catch (error) {
    console.warn('[unity] auto-seed after worktree create failed:', error)
  }
}
