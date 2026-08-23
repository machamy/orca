import type { StateCreator } from 'zustand'
import type { UnitySidebarTintMode } from '../../../../shared/repo-types'
import type { AppState } from '../types'

/**
 * Fork: the sidebar tint mode a project menu is hovering right now.
 *
 * Deliberately session-only — it never reaches the repo record, persistence, or
 * IPC, so a reload drops the hover and the saved setting is what remains.
 */
export type UnityTintSidebarPreviewSlice = {
  unityTintSidebarPreviewByRepoId: Record<string, UnitySidebarTintMode>
  /** `null` clears the repo's preview, restoring its saved mode. */
  setUnityTintSidebarPreview: (repoId: string, mode: UnitySidebarTintMode | null) => void
}

export const createUnityTintSidebarPreviewSlice: StateCreator<
  AppState,
  [],
  [],
  UnityTintSidebarPreviewSlice
> = (set) => ({
  unityTintSidebarPreviewByRepoId: {},
  setUnityTintSidebarPreview: (repoId, mode) =>
    set((state) => {
      const current = state.unityTintSidebarPreviewByRepoId
      if (mode === null) {
        if (!(repoId in current)) {
          return state
        }
        const next = { ...current }
        delete next[repoId]
        return { unityTintSidebarPreviewByRepoId: next }
      }
      // Pointer-move events repeat the same option; a no-op keeps every sidebar
      // row's subscription quiet instead of rebuilding the record per event.
      if (current[repoId] === mode) {
        return state
      }
      return { unityTintSidebarPreviewByRepoId: { ...current, [repoId]: mode } }
    })
})
