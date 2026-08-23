// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, act } from '@testing-library/react'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'

const runFlow = vi.fn(async () => ({ repoId: 'r1' }))
vi.mock('@/lib/default-worktree-switch-flow', () => ({
  runDefaultWorktreeSwitchFlow: (...args: unknown[]) => runFlow(...(args as []))
}))

import { useDefaultWorktreeSwitchDialog } from './use-default-worktree-switch-dialog'

function makeWorktree(id: string, path: string): Worktree {
  return {
    id,
    repoId: 'r1',
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
const repoMap = new Map([[repo.id, repo]])
const defaultRow = makeWorktree('r1::/repo', '/repo')
const feature = makeWorktree('r1::/wt/feature', '/wt/feature')

afterEach(() => {
  cleanup()
  runFlow.mockClear()
})

// Fork contract: the context-menu/drag request opens the confirm dialog only
// for an eligible source, and confirming hands every dialog option to the flow.
describe('useDefaultWorktreeSwitchDialog', () => {
  it('opens the dialog against the repo-path checkout for an eligible source', () => {
    const { result } = renderHook(() =>
      useDefaultWorktreeSwitchDialog(repoMap, [defaultRow, feature])
    )

    act(() => result.current.requestDefaultSwitch(feature))

    expect(result.current.defaultSwitchDialogRequest).toEqual({
      source: feature,
      currentDefault: defaultRow
    })
  })

  it('ignores a request from the default row itself', () => {
    const { result } = renderHook(() =>
      useDefaultWorktreeSwitchDialog(repoMap, [defaultRow, feature])
    )

    act(() => result.current.requestDefaultSwitch(defaultRow))

    expect(result.current.defaultSwitchDialogRequest).toBeNull()
  })

  it('finds the default by repo path, not by isMainWorktree', () => {
    const displacedMain = { ...feature, isMainWorktree: true }
    const { result } = renderHook(() =>
      useDefaultWorktreeSwitchDialog(repoMap, [defaultRow, displacedMain])
    )

    expect(result.current.findDefaultWorktree('r1')?.id).toBe(defaultRow.id)
  })

  it('passes every confirm option through to the switch flow', async () => {
    const { result } = renderHook(() =>
      useDefaultWorktreeSwitchDialog(repoMap, [defaultRow, feature])
    )
    const options = {
      agentsFollow: true,
      notifyAgents: true,
      notifyScope: 'both' as const,
      sleepInPlace: false,
      includeUntracked: false
    }

    await act(async () => {
      await result.current.confirmDefaultSwitch(
        { source: feature, currentDefault: defaultRow },
        options
      )
    })

    expect(runFlow).toHaveBeenCalledWith({ source: feature, currentDefault: defaultRow }, options)
  })
})
