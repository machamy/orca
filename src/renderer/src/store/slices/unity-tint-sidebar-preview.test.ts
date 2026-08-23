import { create } from 'zustand'
import { describe, expect, it } from 'vitest'
import { createUnityTintSidebarPreviewSlice } from './unity-tint-sidebar-preview'
import type { AppState } from '../types'

function makeStore() {
  return create<Pick<AppState, 'unityTintSidebarPreviewByRepoId' | 'setUnityTintSidebarPreview'>>()(
    (...args) =>
      createUnityTintSidebarPreviewSlice(
        ...(args as Parameters<typeof createUnityTintSidebarPreviewSlice>)
      )
  )
}

describe('createUnityTintSidebarPreviewSlice', () => {
  it('starts with no previews', () => {
    expect(makeStore().getState().unityTintSidebarPreviewByRepoId).toEqual({})
  })

  it('stores the hovered mode for one repo', () => {
    const store = makeStore()

    store.getState().setUnityTintSidebarPreview('r1', 'wash')

    expect(store.getState().unityTintSidebarPreviewByRepoId).toEqual({ r1: 'wash' })
  })

  it('replaces the mode as the pointer moves between options', () => {
    const store = makeStore()
    store.getState().setUnityTintSidebarPreview('r1', 'wash')

    store.getState().setUnityTintSidebarPreview('r1', 'chip')

    expect(store.getState().unityTintSidebarPreviewByRepoId).toEqual({ r1: 'chip' })
  })

  it('deletes the entry on null rather than storing off', () => {
    const store = makeStore()
    store.getState().setUnityTintSidebarPreview('r1', 'bar')

    store.getState().setUnityTintSidebarPreview('r1', null)

    expect(store.getState().unityTintSidebarPreviewByRepoId).toEqual({})
    expect('r1' in store.getState().unityTintSidebarPreviewByRepoId).toBe(false)
  })

  it('keeps a previewed mode of off, which is not the same as no preview', () => {
    const store = makeStore()

    store.getState().setUnityTintSidebarPreview('r1', 'off')

    expect(store.getState().unityTintSidebarPreviewByRepoId).toEqual({ r1: 'off' })
  })

  it('keeps repos independent', () => {
    const store = makeStore()
    store.getState().setUnityTintSidebarPreview('r1', 'bar')
    store.getState().setUnityTintSidebarPreview('r2', 'chip')

    store.getState().setUnityTintSidebarPreview('r1', null)

    expect(store.getState().unityTintSidebarPreviewByRepoId).toEqual({ r2: 'chip' })
  })

  it('does not rebuild the record when the hovered option repeats', () => {
    const store = makeStore()
    store.getState().setUnityTintSidebarPreview('r1', 'bar')
    const before = store.getState().unityTintSidebarPreviewByRepoId

    store.getState().setUnityTintSidebarPreview('r1', 'bar')

    expect(store.getState().unityTintSidebarPreviewByRepoId).toBe(before)
  })

  it('does not rebuild the record when clearing a repo that has no preview', () => {
    const store = makeStore()
    store.getState().setUnityTintSidebarPreview('r1', 'bar')
    const before = store.getState().unityTintSidebarPreviewByRepoId

    store.getState().setUnityTintSidebarPreview('r2', null)

    expect(store.getState().unityTintSidebarPreviewByRepoId).toBe(before)
  })
})
