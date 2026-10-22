import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const uiForkListenersApi = {
  // Fork: main asks the renderer to run the default-worktree switch (it owns the
  // sleep/wake half), and offers a Unity cache seed after a worktree is created.
  onDefaultWorktreeSwitchRequest: (
    callback: (data: {
      repoId: string
      worktreeId: string
      followAgents: boolean
      notifyAgents: boolean
      includeUntracked?: boolean
    }) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: {
        repoId: string
        worktreeId: string
        followAgents: boolean
        notifyAgents: boolean
        includeUntracked?: boolean
      }
    ) => callback(data)
    ipcRenderer.on('ui:defaultWorktreeSwitchRequest', listener)
    return () => ipcRenderer.removeListener('ui:defaultWorktreeSwitchRequest', listener)
  },
  onUnityAutoSeedOffer: (
    callback: (data: { repoId: string; worktreePath: string }) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { repoId: string; worktreePath: string }
    ) => callback(data)
    ipcRenderer.on('ui:unityAutoSeedOffer', listener)
    return () => ipcRenderer.removeListener('ui:unityAutoSeedOffer', listener)
  }
} satisfies Partial<PreloadApi['ui']>
