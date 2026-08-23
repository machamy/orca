import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { Worktree } from '../../../../shared/worktree/types'
import type { Repo } from '../../../../shared/repo-types'
import { parseWslUncPath } from '../../../../shared/wsl-paths'

function samePath(left: string, right: string): boolean {
  return normalizeRuntimePathForComparison(left) === normalizeRuntimePathForComparison(right)
}

export function canSwitchWorktreeToDefault(args: {
  source: Worktree | null | undefined
  target: Worktree | null | undefined
  repo: Repo | null | undefined
  draggedCount: number
}): boolean {
  const { source, target, repo } = args
  return Boolean(
    args.draggedCount === 1 &&
    source &&
    target &&
    repo &&
    repo.kind !== 'folder' &&
    !repo.connectionId &&
    getRepoExecutionHostId(repo) === 'local' &&
    // Backend refuses WSL switches; don't offer a drop target that always errors.
    !parseWslUncPath(repo.path) &&
    !source.isBare &&
    !target.isBare &&
    source.repoId === target.repoId &&
    source.repoId === repo.id &&
    samePath(target.path, repo.path) &&
    !samePath(source.path, repo.path)
  )
}

export function getDefaultSwitchDropTargetId(args: {
  container: HTMLElement
  x: number
  y: number
}): string | null {
  const target = document.elementFromPoint(args.x, args.y)
  if (!(target instanceof Element) || !args.container.contains(target)) {
    return null
  }
  const dropTarget = target.closest<HTMLElement>('[data-default-worktree-switch-drop-target]')
  return dropTarget && args.container.contains(dropTarget)
    ? (dropTarget.dataset.defaultWorktreeSwitchDropTarget ?? null)
    : null
}
