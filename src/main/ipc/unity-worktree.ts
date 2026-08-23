import { ipcMain } from 'electron'
import {
  getUnityWorktreeStatus,
  openUnityProject,
  seedUnityWorktreeCache
} from '../unity/unity-project-worktree'
import { applyUnityWorktreeTint } from '../unity/unity-worktree-tint-apply'
import { openUnityProjectInRider } from '../unity/unity-rider-open'
import type {
  UnityOpenResult,
  UnityRiderOpenResult,
  UnitySeedResult,
  UnityTintApplyResult,
  UnityWorktreeStatus
} from '../../shared/unity-worktree'

/** Per-worktree Unity actions (fork feature): seed the Library cache from the
 *  default checkout, and open a worktree in its exact editor version. All three
 *  are local-filesystem operations — the renderer gates them to local worktrees. */
export function registerUnityWorktreeHandlers(): void {
  ipcMain.removeHandler('unity:worktreeStatus')
  ipcMain.handle(
    'unity:worktreeStatus',
    async (
      _event,
      args: { worktreePath: string; sourcePath: string }
    ): Promise<UnityWorktreeStatus> => getUnityWorktreeStatus(args)
  )

  ipcMain.removeHandler('unity:seedWorktreeCache')
  ipcMain.handle(
    'unity:seedWorktreeCache',
    async (
      _event,
      args: {
        worktreePath: string
        sourcePath: string
        tint?: boolean
        tintSiblingLabels?: string[]
        tintOverridesByLabel?: Record<string, string>
      }
    ): Promise<UnitySeedResult> => seedUnityWorktreeCache(args)
  )

  ipcMain.removeHandler('unity:openProject')
  ipcMain.handle(
    'unity:openProject',
    async (
      _event,
      args: {
        worktreePath: string
        tint?: boolean
        tintSiblingLabels?: string[]
        tintOverridesByLabel?: Record<string, string>
      }
    ): Promise<UnityOpenResult> => openUnityProject(args)
  )

  ipcMain.removeHandler('unity:applyWorktreeTint')
  ipcMain.handle(
    'unity:applyWorktreeTint',
    async (
      _event,
      args: {
        worktreePath: string
        enabled: boolean
        label?: string
        tintSiblingLabels?: string[]
        tintOverridesByLabel?: Record<string, string>
      }
    ): Promise<UnityTintApplyResult> => applyUnityWorktreeTint(args)
  )

  ipcMain.removeHandler('unity:openInRider')
  ipcMain.handle(
    'unity:openInRider',
    async (
      _event,
      args: { worktreePath: string; sourcePath?: string }
    ): Promise<UnityRiderOpenResult> => openUnityProjectInRider(args)
  )
}
