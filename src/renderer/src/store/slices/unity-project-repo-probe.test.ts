// @vitest-environment happy-dom

import { create } from 'zustand'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUnityProjectRepoProbeSlice } from './unity-project-repo-probe'
import type { AppState } from '../types'
import type { UnityWorktreeStatus } from '../../../../shared/unity-worktree'

type ProbeStore = Pick<
  AppState,
  'unityProjectRepoProbeByRepoId' | 'probeUnityProjectRepo' | 'markUnityProjectRepoDetected'
>

function makeStore() {
  return create<ProbeStore>()((...args) =>
    createUnityProjectRepoProbeSlice(
      ...(args as Parameters<typeof createUnityProjectRepoProbeSlice>)
    )
  )
}

function status(isUnityProject: boolean): UnityWorktreeStatus {
  return {
    isUnityProject,
    editorVersion: null,
    editorInstalled: false,
    worktreeHasLibrary: false,
    sourceHasLibrary: false,
    riderInstalled: false
  }
}

function stubWorktreeStatus(
  impl: (args: { worktreePath: string; sourcePath: string }) => Promise<UnityWorktreeStatus>
): ReturnType<typeof vi.fn> {
  const worktreeStatus = vi.fn(impl)
  ;(window as unknown as { api?: unknown }).api = { unity: { worktreeStatus } }
  return worktreeStatus
}

afterEach(() => {
  delete (window as unknown as { api?: unknown }).api
  vi.clearAllMocks()
})

describe('createUnityProjectRepoProbeSlice', () => {
  it('starts with nothing known', () => {
    expect(makeStore().getState().unityProjectRepoProbeByRepoId).toEqual({})
  })

  it('marks a repo pending, then records the probe answer', async () => {
    stubWorktreeStatus(async () => status(true))
    const store = makeStore()

    store.getState().probeUnityProjectRepo('r1', '/repo')
    expect(store.getState().unityProjectRepoProbeByRepoId.r1).toEqual({
      path: '/repo',
      state: 'pending'
    })

    await vi.waitFor(() =>
      expect(store.getState().unityProjectRepoProbeByRepoId.r1).toEqual({
        path: '/repo',
        state: 'yes'
      })
    )
  })

  it('records a plain repo as no', async () => {
    stubWorktreeStatus(async () => status(false))
    const store = makeStore()

    store.getState().probeUnityProjectRepo('r1', '/repo')

    await vi.waitFor(() =>
      expect(store.getState().unityProjectRepoProbeByRepoId.r1?.state).toBe('no')
    )
  })

  it('probes a repo once however many callers ask', async () => {
    const worktreeStatus = stubWorktreeStatus(async () => status(true))
    const store = makeStore()

    store.getState().probeUnityProjectRepo('r1', '/repo')
    store.getState().probeUnityProjectRepo('r1', '/repo')
    await vi.waitFor(() =>
      expect(store.getState().unityProjectRepoProbeByRepoId.r1?.state).toBe('yes')
    )
    store.getState().probeUnityProjectRepo('r1', '/repo')

    expect(worktreeStatus).toHaveBeenCalledTimes(1)
  })

  it('re-probes when the repo path changes', async () => {
    const worktreeStatus = stubWorktreeStatus(async () => status(true))
    const store = makeStore()

    store.getState().probeUnityProjectRepo('r1', '/repo')
    await vi.waitFor(() =>
      expect(store.getState().unityProjectRepoProbeByRepoId.r1?.state).toBe('yes')
    )
    store.getState().probeUnityProjectRepo('r1', '/moved')

    expect(worktreeStatus).toHaveBeenCalledTimes(2)
    await vi.waitFor(() =>
      expect(store.getState().unityProjectRepoProbeByRepoId.r1).toEqual({
        path: '/moved',
        state: 'yes'
      })
    )
  })

  it('drops the entry when the probe fails, so a later caller retries', async () => {
    const worktreeStatus = stubWorktreeStatus(async () => {
      throw new Error('nope')
    })
    const store = makeStore()

    store.getState().probeUnityProjectRepo('r1', '/repo')
    await vi.waitFor(() =>
      expect('r1' in store.getState().unityProjectRepoProbeByRepoId).toBe(false)
    )

    store.getState().probeUnityProjectRepo('r1', '/repo')
    expect(worktreeStatus).toHaveBeenCalledTimes(2)
  })

  it('does nothing without the Unity IPC surface', () => {
    const store = makeStore()

    store.getState().probeUnityProjectRepo('r1', '/repo')

    expect(store.getState().unityProjectRepoProbeByRepoId).toEqual({})
  })

  it('lets an outside sighting light a repo up without a probe', () => {
    const store = makeStore()

    store.getState().markUnityProjectRepoDetected('r1', '/repo')

    expect(store.getState().unityProjectRepoProbeByRepoId.r1).toEqual({
      path: '/repo',
      state: 'yes'
    })
  })

  it('upgrades a cached no when a Unity project is later sighted', async () => {
    stubWorktreeStatus(async () => status(false))
    const store = makeStore()
    store.getState().probeUnityProjectRepo('r1', '/repo')
    await vi.waitFor(() =>
      expect(store.getState().unityProjectRepoProbeByRepoId.r1?.state).toBe('no')
    )

    store.getState().markUnityProjectRepoDetected('r1', '/repo')

    expect(store.getState().unityProjectRepoProbeByRepoId.r1?.state).toBe('yes')
  })

  it('keeps a repeated sighting from churning subscribers', () => {
    const store = makeStore()
    store.getState().markUnityProjectRepoDetected('r1', '/repo')
    const before = store.getState().unityProjectRepoProbeByRepoId

    store.getState().markUnityProjectRepoDetected('r1', '/repo')

    expect(store.getState().unityProjectRepoProbeByRepoId).toBe(before)
  })

  it('leaves other repos alone', async () => {
    stubWorktreeStatus(async (args) => status(args.sourcePath === '/unity'))
    const store = makeStore()

    store.getState().probeUnityProjectRepo('r1', '/unity')
    store.getState().probeUnityProjectRepo('r2', '/plain')

    await vi.waitFor(() => {
      expect(store.getState().unityProjectRepoProbeByRepoId.r1?.state).toBe('yes')
      expect(store.getState().unityProjectRepoProbeByRepoId.r2?.state).toBe('no')
    })
  })
})
