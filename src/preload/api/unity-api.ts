import type {
  UnityOpenResult,
  UnityRiderOpenResult,
  UnitySeedResult,
  UnityTintApplyResult,
  UnityWorktreeStatus
} from '../../shared/unity-worktree'

/** Fork feature: per-worktree Unity actions (seed the Library cache from the
 *  default checkout, open a worktree in its exact editor version). */
export type UnityApi = {
  worktreeStatus: (args: {
    worktreePath: string
    sourcePath: string
  }) => Promise<UnityWorktreeStatus>
  seedWorktreeCache: (args: {
    worktreePath: string
    sourcePath: string
    tint?: boolean
    tintSiblingLabels?: string[]
    tintOverridesByLabel?: Record<string, string>
  }) => Promise<UnitySeedResult>
  openProject: (args: {
    worktreePath: string
    tint?: boolean
    tintSiblingLabels?: string[]
    tintOverridesByLabel?: Record<string, string>
  }) => Promise<UnityOpenResult>
  /** Re-writes the tint script after a colour choice, without opening Unity. */
  applyWorktreeTint: (args: {
    worktreePath: string
    enabled: boolean
    label?: string
    tintSiblingLabels?: string[]
    tintOverridesByLabel?: Record<string, string>
  }) => Promise<UnityTintApplyResult>
  openInRider: (args: {
    worktreePath: string
    sourcePath?: string
  }) => Promise<UnityRiderOpenResult>
}
