// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { useWorktreeDefaultSwitchDropCommit } from './use-default-switch-drop-commit'
import { getPointerDropStatusTarget } from './status-target'
import { NO_WORKTREE_SIDEBAR_DROP_TARGET } from './row-state'

function makeWorktree(id: string, repoId: string, path: string): Worktree {
  return {
    id,
    repoId,
    path,
    head: 'abc',
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

const repo: Repo = { id: 'r1', path: '/repo', displayName: 'R', badgeColor: '#000', addedAt: 0 }
const defaultRow = makeWorktree('r1::/repo', 'r1', '/repo')
const feature = makeWorktree('r1::/wt/feature', 'r1', '/wt/feature')

function setup(onDefaultSwitchRequest?: (worktree: Worktree) => void) {
  return renderHook(() =>
    useWorktreeDefaultSwitchDropCommit({
      repoMap: new Map([[repo.id, repo]]),
      worktreeMap: new Map([
        [defaultRow.id, defaultRow],
        [feature.id, feature]
      ]),
      onDefaultSwitchRequest
    })
  ).result
}

afterEach(cleanup)

describe('useWorktreeDefaultSwitchDropCommit', () => {
  it('commits an eligible single-worktree drop as a switch request', () => {
    const request = vi.fn()
    const result = setup(request)

    expect(result.current.commitWorktreeDefaultSwitchDrop([feature.id], defaultRow.id)).toBe(true)
    expect(request).toHaveBeenCalledWith(feature)
  })

  it('refuses multi-drag, self-drop, and unknown targets', () => {
    const request = vi.fn()
    const result = setup(request)

    expect(
      result.current.commitWorktreeDefaultSwitchDrop([feature.id, defaultRow.id], defaultRow.id)
    ).toBe(false)
    expect(result.current.commitWorktreeDefaultSwitchDrop([defaultRow.id], defaultRow.id)).toBe(
      false
    )
    expect(result.current.commitWorktreeDefaultSwitchDrop([feature.id], 'r1::/missing')).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  it('filters the hover target exactly like the commit gate', () => {
    const result = setup(vi.fn())
    const target = { ...NO_WORKTREE_SIDEBAR_DROP_TARGET, defaultSwitchTargetId: defaultRow.id }

    expect(result.current.filterEligibleDefaultSwitchTarget(target, [feature.id])).toBe(target)
    expect(
      result.current.filterEligibleDefaultSwitchTarget(target, [defaultRow.id])
        .defaultSwitchTargetId
    ).toBeNull()
  })

  it('goes inert without a request handler', () => {
    const result = setup(undefined)
    const target = { ...NO_WORKTREE_SIDEBAR_DROP_TARGET, defaultSwitchTargetId: defaultRow.id }

    expect(
      result.current.filterEligibleDefaultSwitchTarget(target, [feature.id]).defaultSwitchTargetId
    ).toBeNull()
    expect(result.current.commitWorktreeDefaultSwitchDrop([feature.id], defaultRow.id)).toBe(false)
  })
})

describe('getPointerDropStatusTarget default-switch hit test', () => {
  it('reports the worktree id from the zone under the pointer', () => {
    const container = document.createElement('div')
    const zone = document.createElement('div')
    zone.dataset.defaultWorktreeSwitchDropTarget = defaultRow.id
    container.appendChild(zone)
    document.body.appendChild(container)
    // happy-dom lacks layout; point elementFromPoint at the zone directly.
    document.elementFromPoint = () => zone

    const target = getPointerDropStatusTarget({ container, x: 10, y: 10 })

    expect(target.defaultSwitchTargetId).toBe(defaultRow.id)
    expect(target.lineageParentId).toBeNull()
    container.remove()
  })
})

describe('resolveWorktreeSidebarStatusDropCommitTarget default-switch accuracy', () => {
  it('never resurrects a default-switch target the pointer left', async () => {
    const { resolveWorktreeSidebarStatusDropCommitTarget } =
      await import('../../worktree-sidebar-drop-preview')
    const result = resolveWorktreeSidebarStatusDropCommitTarget({
      currentTarget: { status: null, isPinDrop: false, lineageParentId: null },
      currentPreview: null,
      latestTrackedTarget: {
        target: {
          status: null,
          isPinDrop: false,
          lineageParentId: null,
          defaultSwitchTargetId: defaultRow.id
        },
        preview: null,
        x: 100,
        y: 100
      },
      x: 102,
      y: 101
    })
    expect(result.target.defaultSwitchTargetId ?? null).toBeNull()
  })
})
