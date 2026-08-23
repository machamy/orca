import type { WorktreeSlice } from '../../worktree-helpers'

export const worktreeSliceInitialState: Pick<
  WorktreeSlice,
  | 'worktreesByRepo'
  | 'detectedWorktreesByRepo'
  | 'worktreeLineageById'
  | 'workspaceLineageByChildKey'
  | 'activeWorktreeId'
  | 'activeWorkspaceKey'
  | 'activeWorkspaceExecutionHostId'
  | 'pendingWorktreeCreations'
  | 'activePendingCreationId'
  | 'renamingWorktreeId'
  | 'defaultSwitchInFlight'
  | 'deleteStateByWorktreeId'
  | 'baseStatusByWorktreeId'
  | 'remoteBranchConflictByWorktreeId'
  | 'sortEpoch'
  | 'everActivatedWorktreeIds'
  | 'lastVisitedAtByWorktreeId'
  | 'hasHydratedWorktreePurge'
  | 'startupWorktreeRefreshCompleted'
> = {
  worktreesByRepo: {},
  detectedWorktreesByRepo: {},
  worktreeLineageById: {},
  workspaceLineageByChildKey: {},
  activeWorktreeId: null,
  activeWorkspaceKey: null,
  activeWorkspaceExecutionHostId: null,
  pendingWorktreeCreations: {},
  activePendingCreationId: null,
  renamingWorktreeId: null,
  // Fork feature: default-worktree switch in-flight marker (owner-token CAS).
  defaultSwitchInFlight: null,
  deleteStateByWorktreeId: {},
  baseStatusByWorktreeId: {},
  remoteBranchConflictByWorktreeId: {},
  sortEpoch: 0,
  everActivatedWorktreeIds: new Set<string>(),
  lastVisitedAtByWorktreeId: {},
  hasHydratedWorktreePurge: false,
  startupWorktreeRefreshCompleted: false
}
