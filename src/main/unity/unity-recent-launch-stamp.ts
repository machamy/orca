/**
 * Projects this Orca just launched Unity on. Unity creates its lockfile only
 * seconds after the process starts, so for that window the process table may
 * miss it too — our own launches must not slip through their own gates (the
 * seeding gate, and openUnityProject's duplicate-launch guard).
 */
const recentlyLaunchedProjects = new Map<string, number>()
const RECENT_LAUNCH_TTL_MS = 120_000

export function stampUnityEditorLaunch(projectPath: string): void {
  recentlyLaunchedProjects.set(projectPath, Date.now())
}

export function unityEditorRecentlyLaunched(projectPath: string): boolean {
  return unityEditorLaunchStampAgeMs(projectPath) !== null
}

/** Age of a still-live stamp, or null once it expired (or never existed). */
export function unityEditorLaunchStampAgeMs(projectPath: string): number | null {
  const launchedAt = recentlyLaunchedProjects.get(projectPath)
  if (launchedAt === undefined) {
    return null
  }
  const age = Date.now() - launchedAt
  return age < RECENT_LAUNCH_TTL_MS ? age : null
}

// Unity creates its lockfile within seconds of starting; past this grace a
// stamped launch with neither process nor lockfile is dead, not starting.
const LAUNCH_STAMP_STARTUP_GRACE_MS = 15_000

/**
 * Whether a stamp still blocks a relaunch when NO editor process was found:
 * within the startup grace (the editor may not be in the process table yet),
 * or while the project lockfile says a launched editor is (or was) alive.
 * A bare stamp must not block for its full TTL after a quit or crash.
 */
export function unityLaunchStampStillBlocksRelaunch(
  projectPath: string,
  lockfilePresent: boolean
): boolean {
  const age = unityEditorLaunchStampAgeMs(projectPath)
  return age !== null && (age <= LAUNCH_STAMP_STARTUP_GRACE_MS || lockfilePresent)
}
