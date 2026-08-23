import { describe, expect, it } from 'vitest'
import { computeVisibleWorktreeIds } from './visible-worktrees'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'

function makeWorktree(id: string, repoId = 'repo1'): Worktree & { instanceId: string } {
  return {
    id,
    instanceId: `${id}-instance`,
    repoId,
    path: `/tmp/${id}`,
    head: 'abc123',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree: false,
    displayName: id,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
}

const repoMap = new Map<string, Repo>([
  ['repo1', { id: 'repo1', path: '/repo1', displayName: 'Repo 1', badgeColor: '#000', addedAt: 0 }]
])

type VisibleOptions = Parameters<typeof computeVisibleWorktreeIds>[2]

function visibleOptions(overrides: Partial<VisibleOptions> = {}): VisibleOptions {
  return {
    filterRepoIds: [],
    showSleepingWorkspaces: true,
    tabsByWorktree: {},
    ptyIdsByTabId: {},
    browserTabsByWorktree: {},
    worktreeIdsWithLiveAgent: new Set(),
    hideDefaultBranchWorkspace: false,
    hideAutomationGeneratedWorkspaces: false,
    hideCliCreatedWorkspaces: false,
    hideDetachedHeadWorkspaces: false,
    hideWorkspacesFromOtherDevices: false,
    pairedDeviceIdsByEnvironment: new Map(),
    repoMap,
    workspaceHostScope: 'all',
    defaultHostId: LOCAL_EXECUTION_HOST_ID,
    worktreeLineageById: {},
    ...overrides
  }
}

// Fork: after a default-worktree switch the repo-path checkout is the real
// default; git's isMainWorktree follows the displaced checkout and must not
// grant it sweep exemption.
describe('computeVisibleWorktreeIds default-checkout semantics', () => {
  it('sweeps a sleeping displaced Git main while keeping the repo-path default', () => {
    const currentDefault = {
      ...makeWorktree('current-default'),
      id: 'repo1::/repo1',
      path: '/repo1',
      isMainWorktree: false,
      branch: 'refs/heads/main'
    }
    const displacedMain = {
      ...makeWorktree('displaced-main'),
      path: '/tmp/displaced-main',
      isMainWorktree: true,
      branch: 'refs/heads/feature'
    }

    const result = computeVisibleWorktreeIds(
      { repo1: [currentDefault, displacedMain] },
      [currentDefault.id, displacedMain.id],
      visibleOptions({
        showSleepingWorkspaces: false,
        alwaysShowDefaultBranchWorkspace: true
      })
    )

    expect(result).toEqual([currentDefault.id])
  })
})
