import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import { isValidResolvedWorktreeLineageEdge } from '../../../../shared/resolved-worktree-lineage'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { AppState } from '@/store/types'
import { getProjectedWorktreeLineage } from './worktree-lineage-projection'

/**
 * Fork E5: valid DIRECT lineage children of one worktree — the rows the
 * conversion moves into the new folder. Deeper descendants keep their own
 * lineage parents and follow their subtree in untouched.
 */
export function getDirectWorktreeLineageChildren(
  parent: Worktree,
  worktrees: readonly Worktree[],
  lineageById: Readonly<Record<string, WorktreeLineage>>,
  cyclicLineageIds: ReadonlySet<string>
): Worktree[] {
  return worktrees.filter((candidate) => {
    if (candidate.id === parent.id || cyclicLineageIds.has(candidate.id)) {
      return false
    }
    const lineage = getProjectedWorktreeLineage(candidate, lineageById)
    return (
      lineage != null &&
      lineage.parentWorktreeId === parent.id &&
      isValidResolvedWorktreeLineageEdge(candidate, parent, lineage)
    )
  })
}

/**
 * The valid DIRECT lineage parent of one worktree — the same edge standard as
 * `getDirectWorktreeLineageChildren`, seen from the child. Non-null means the
 * folder resolver ignores this row's own membership (lineage wins).
 */
export function getValidWorktreeLineageParent(
  child: Worktree,
  worktrees: readonly Worktree[],
  lineageById: Readonly<Record<string, WorktreeLineage>>,
  cyclicLineageIds: ReadonlySet<string>
): Worktree | null {
  if (cyclicLineageIds.has(child.id)) {
    return null
  }
  const lineage = getProjectedWorktreeLineage(child, lineageById)
  if (!lineage) {
    return null
  }
  const parent = worktrees.find((candidate) => candidate.id === lineage.parentWorktreeId)
  // Same-project only: the resolver buckets membership per repo block, so a
  // cross-repo edge never hides this row's own membership.
  if (!parent || parent.id === child.id || parent.repoId !== child.repoId) {
    return null
  }
  return isValidResolvedWorktreeLineageEdge(child, parent, lineage) ? parent : null
}

type ConversionStore = Pick<
  AppState,
  'createWorktreeFolder' | 'setWorktreeFolderMembership' | 'updateWorktreeLineage'
>

export type WorktreeFolderFilingTarget = {
  id: string
  /** True when the row is a valid lineage child — filed membership would be invisible. */
  requiresUnnest: boolean
}

export type WorktreeFolderFilingResult = {
  /** Every requested un-nest landed. */
  complete: boolean
  /** The membership write over the un-nested (or already root) ids succeeded. */
  filed: boolean
}

/**
 * E5 primitive: clear each target's `parentWorktreeId` first, then file only
 * the rows whose un-nest landed — membership is only readable on a lineage
 * root, so a still-nested row must never be filed.
 */
export async function unnestAndFileWorktreesIntoFolder(
  store: Pick<AppState, 'setWorktreeFolderMembership' | 'updateWorktreeLineage'>,
  targets: readonly WorktreeFolderFilingTarget[],
  folderId: string
): Promise<WorktreeFolderFilingResult> {
  const fileableIds: string[] = []
  let complete = true
  await Promise.all(
    targets.map(async (target) => {
      if (!target.requiresUnnest) {
        fileableIds.push(target.id)
        return
      }
      try {
        await store.updateWorktreeLineage(target.id, { noParent: true })
        fileableIds.push(target.id)
      } catch (err) {
        console.error('Failed to un-nest worktree before filing it into a folder:', err)
        complete = false
      }
    })
  )
  const filed = await store.setWorktreeFolderMembership(fileableIds, folderId)
  return { complete, filed }
}

export type WorktreeFolderConversionResult = {
  folderId: string
  /** Every direct child un-nested and filed. False leaves the worktree convertible again. */
  complete: boolean
}

/**
 * Fork E5 / doc §11: create a folder named after the worktree and move its
 * DIRECT lineage children in. Each child's `parentWorktreeId` is cleared
 * *before* it is filed — membership is only readable on a lineage root, so the
 * two writes must be sequenced, unlike the un-awaited reorder+unnest pair.
 * Deletion of the emptied worktree is the caller's separately-confirmed offer;
 * this function never deletes a workspace.
 */
export async function convertWorktreeToFolder(
  store: ConversionStore,
  args: {
    worktree: Worktree
    repo: Repo
    directChildren: readonly Worktree[]
  }
): Promise<WorktreeFolderConversionResult | null> {
  const folder = await store.createWorktreeFolder(
    args.repo.id,
    { name: args.worktree.displayName },
    { hostId: getRepoExecutionHostId(args.repo) }
  )
  if (!folder) {
    return null
  }
  const { complete, filed } = await unnestAndFileWorktreesIntoFolder(
    store,
    args.directChildren.map((child) => ({ id: child.id, requiresUnnest: true })),
    folder.id
  )
  return { folderId: folder.id, complete: complete && filed }
}
