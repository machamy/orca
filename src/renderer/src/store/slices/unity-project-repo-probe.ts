import type { StateCreator } from 'zustand'
import type { AppState } from '../types'

/** `'pending'` is a real state, not a placeholder for `'no'`: a caller must show
 *  nothing until the answer is `'yes'`, rather than guess colour on. */
export type UnityProjectRepoProbe = {
  /** The repo path this answer describes; a repo that moves is re-probed. */
  path: string
  state: 'pending' | 'yes' | 'no'
}

/**
 * Fork: does a repo hold a Unity project? Answered once per repo, per session.
 *
 * The sidebar tint is default-on, so every worktree row needs this answer, and
 * the only source of truth is a filesystem probe. Caching it here keeps that to
 * one IPC round trip per repo no matter how many rows render, and — unlike a
 * field on the repo record — a wrong or outdated answer cannot outlive the
 * session. A repo that becomes a Unity project mid-session still lights up:
 * opening its worktree's Unity menu already probes, and reports the `'yes'`
 * back through `markUnityProjectRepoDetected`.
 */
export type UnityProjectRepoProbeSlice = {
  unityProjectRepoProbeByRepoId: Record<string, UnityProjectRepoProbe>
  /** No-ops once the repo is answered or a probe for it is already in flight. */
  probeUnityProjectRepo: (repoId: string, repoPath: string) => void
  /** A Unity project found elsewhere (the context menu), reported for free. */
  markUnityProjectRepoDetected: (repoId: string, repoPath: string) => void
}

function writeProbe(
  probes: Record<string, UnityProjectRepoProbe>,
  repoId: string,
  entry: UnityProjectRepoProbe | null
): Record<string, UnityProjectRepoProbe> {
  const next = { ...probes }
  if (entry === null) {
    delete next[repoId]
  } else {
    next[repoId] = entry
  }
  return next
}

export const createUnityProjectRepoProbeSlice: StateCreator<
  AppState,
  [],
  [],
  UnityProjectRepoProbeSlice
> = (set, get) => ({
  unityProjectRepoProbeByRepoId: {},
  probeUnityProjectRepo: (repoId, repoPath) => {
    if (get().unityProjectRepoProbeByRepoId[repoId]?.path === repoPath) {
      return
    }
    const probe = window.api?.unity?.worktreeStatus
    if (!probe) {
      return
    }
    set((state) => ({
      unityProjectRepoProbeByRepoId: writeProbe(state.unityProjectRepoProbeByRepoId, repoId, {
        path: repoPath,
        state: 'pending'
      })
    }))
    // The repo's own checkout answers for the repo, so the status call doubles
    // as the project test — no second IPC surface to keep in sync.
    void probe({ worktreePath: repoPath, sourcePath: repoPath })
      .then((status) => {
        set((state) =>
          state.unityProjectRepoProbeByRepoId[repoId]?.path === repoPath
            ? {
                unityProjectRepoProbeByRepoId: writeProbe(
                  state.unityProjectRepoProbeByRepoId,
                  repoId,
                  { path: repoPath, state: status.isUnityProject ? 'yes' : 'no' }
                )
              }
            : state
        )
      })
      .catch(() => {
        // Dropped, not recorded as 'no': a stuck 'pending' would keep the repo
        // dark for the whole session, while an absent entry lets the next row
        // that mounts retry.
        set((state) =>
          state.unityProjectRepoProbeByRepoId[repoId]?.path === repoPath
            ? {
                unityProjectRepoProbeByRepoId: writeProbe(
                  state.unityProjectRepoProbeByRepoId,
                  repoId,
                  null
                )
              }
            : state
        )
      })
  },
  markUnityProjectRepoDetected: (repoId, repoPath) =>
    set((state) => {
      const current = state.unityProjectRepoProbeByRepoId[repoId]
      // Upgrade only. The reporter saw one worktree, whose branch may simply not
      // carry the Unity files the repo has elsewhere — that is no evidence of a
      // 'no', but a sighting is proof of a 'yes'.
      if (current?.path === repoPath && current.state === 'yes') {
        return state
      }
      return {
        unityProjectRepoProbeByRepoId: writeProbe(state.unityProjectRepoProbeByRepoId, repoId, {
          path: repoPath,
          state: 'yes'
        })
      }
    })
})
