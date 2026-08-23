// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import type { Repo } from '../../../../shared/repo-types'
import {
  canSwitchWorktreeToDefault,
  getDefaultSwitchDropTargetId
} from './default-worktree-switch-eligibility'

const repo = {
  id: 'repo-1',
  path: '/repo',
  kind: 'git',
  executionHostId: 'local'
} as Repo
const source = {
  id: 'repo-1::/feature',
  repoId: 'repo-1',
  path: '/feature',
  isMainWorktree: false,
  isBare: false
} as Worktree
const target = {
  id: 'repo-1::/repo',
  repoId: 'repo-1',
  path: '/repo',
  isMainWorktree: true,
  isBare: false
} as Worktree

describe('default worktree switch eligibility', () => {
  it('allows one local worktree to target the repo path', () => {
    expect(canSwitchWorktreeToDefault({ source, target, repo, draggedCount: 1 })).toBe(true)
  })

  it('allows the Git main role after it has moved away from the repo path', () => {
    expect(
      canSwitchWorktreeToDefault({
        source: { ...source, isMainWorktree: true },
        target: { ...target, isMainWorktree: false },
        repo,
        draggedCount: 1
      })
    ).toBe(true)
  })

  it('rejects WSL repos the backend always refuses', () => {
    const wslRepo = { ...repo, path: '\\\\wsl$\\Ubuntu\\home\\me\\repo' } as Repo
    expect(
      canSwitchWorktreeToDefault({
        source: { ...source, path: '\\\\wsl$\\Ubuntu\\home\\me\\feature' },
        target: { ...target, path: wslRepo.path },
        repo: wslRepo,
        draggedCount: 1
      })
    ).toBe(false)
  })

  it('rejects multi-selection, SSH, folder, and cross-repo targets', () => {
    expect(canSwitchWorktreeToDefault({ source, target, repo, draggedCount: 2 })).toBe(false)
    expect(
      canSwitchWorktreeToDefault({
        source,
        target,
        repo: { ...repo, connectionId: 'ssh-1' },
        draggedCount: 1
      })
    ).toBe(false)
    expect(
      canSwitchWorktreeToDefault({
        source,
        target,
        repo: { ...repo, kind: 'folder' },
        draggedCount: 1
      })
    ).toBe(false)
    expect(
      canSwitchWorktreeToDefault({
        source: { ...source, repoId: 'repo-2' },
        target,
        repo,
        draggedCount: 1
      })
    ).toBe(false)
  })

  it('resolves the marked default-card band under the pointer', () => {
    const container = document.createElement('div')
    const band = document.createElement('div')
    const child = document.createElement('span')
    band.dataset.defaultWorktreeSwitchDropTarget = target.id
    band.append(child)
    container.append(band)
    document.body.append(container)
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(child)

    expect(getDefaultSwitchDropTargetId({ container, x: 10, y: 10 })).toBe(target.id)
  })
})
