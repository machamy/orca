import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../../api-types'

export const uiForkListenersApi = {
  // Fork: offers a Unity cache seed after a worktree is created.
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
