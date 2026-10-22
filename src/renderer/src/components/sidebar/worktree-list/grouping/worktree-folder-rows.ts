import { useMemo } from 'react'
import type { GlobalSettings } from '../../../../../../shared/global-settings-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import {
  getWorktreeExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../../../../shared/execution-host'
import { WORKTREE_FOLDERS_RUNTIME_CAPABILITY } from '../../../../../../shared/protocol-version'
import { isValidResolvedWorktreeLineageEdge } from '../../../../../../shared/resolved-worktree-lineage'
import {
  resolveWorktreeFolderTree,
  type ResolvedWorktreeFolderTree,
  type WorktreeFolderMember
} from '../../../../../../shared/worktree-folder/resolve'
import {
  worktreeFolderHostRepoKey,
  type SidebarWorktreeFolderModel,
  type SidebarWorktreeFolderProject
} from '../../../../../../shared/sidebar-list/worktree-folder-rows'
import {
  getCyclicProjectedWorktreeLineageIds,
  getProjectedWorktreeLineage
} from '../../../../../../shared/sidebar-list/worktree-lineage-projection'
import { findRepoForHost } from '../../../../store/slices/repo-host-identity'

// Emission and row keys live in the shared builder; the window only resolves membership.
export {
  getWorktreeFolderGroupKey,
  shouldRenderWorktreeFoldersForGroupBy,
  type SidebarWorktreeFolderModel
} from '../../../../../../shared/sidebar-list/worktree-folder-rows'

type FolderSettings = Pick<
  GlobalSettings,
  'activeRuntimeEnvironmentId' | 'experimentalWorktreeFolders'
> | null

/** The one slice of runtime status folder emission reads. */
export type WorktreeFolderRuntimeStatusLookup = ReadonlyMap<
  string,
  { status: { capabilities?: readonly string[] } | null } | undefined
>

/**
 * G5a: a paired host that does not advertise `worktree.folders.v1` can still
 * echo folder records it does not understand while never projecting membership
 * — folders with zero members everywhere. Suppress that host's folder rows so
 * the sidebar reads "this host doesn't know folders", not "your folders are
 * empty". Records stay in the store untouched; nothing is deleted. An absent
 * status (not probed yet) does not suppress — only a known capability gap does.
 */
export function isWorktreeFolderEmissionSuppressedForHost(
  hostId: ExecutionHostId,
  runtimeStatusByEnvironmentId: WorktreeFolderRuntimeStatusLookup | null | undefined
): boolean {
  const parsed = parseExecutionHostId(hostId)
  if (parsed?.kind !== 'runtime') {
    return false
  }
  const status = runtimeStatusByEnvironmentId?.get(parsed.environmentId)?.status
  if (!status) {
    return false
  }
  return status.capabilities?.includes(WORKTREE_FOLDERS_RUNTIME_CAPABILITY) !== true
}

/**
 * Resolver input for one host's slice of one project. The lineage edge is the
 * *validated, projected* one — the same edge `appendWorktreeRows` nests by — so
 * membership buckets can never disagree with the rendered subtrees (C9/B5).
 */
export function resolveWorktreeFolderTreeForProject(args: {
  repo: Repo
  worktrees: readonly Worktree[]
  lineageById: Record<string, WorktreeLineage>
  cyclicLineageIds: ReadonlySet<string>
}): ResolvedWorktreeFolderTree {
  const byId = new Map(args.worktrees.map((worktree) => [worktree.id, worktree]))
  const members: WorktreeFolderMember[] = args.worktrees.map((worktree) => {
    const projected = getProjectedWorktreeLineage(worktree, args.lineageById)
    const inline = (worktree as Worktree & { lineage?: WorktreeLineage | null }).lineage
    const lineage = projected?.worktreeInstanceId === worktree.instanceId ? projected : inline
    const parent =
      lineage && !args.cyclicLineageIds.has(worktree.id) ? byId.get(lineage.parentWorktreeId) : null
    const parentWorktreeId =
      parent && lineage && isValidResolvedWorktreeLineageEdge(worktree, parent, lineage)
        ? parent.id
        : null
    return { id: worktree.id, parentWorktreeId, worktreeFolderId: worktree.worktreeFolderId }
  })
  return resolveWorktreeFolderTree(args.repo.worktreeFolders, members)
}

/**
 * Resolve folder membership once per project per host, from the full visible
 * worktree set — before any lane splitting (§6). Returns null when the toggle
 * is off or no repo in play has folder records, so every caller falls through
 * to the untouched, byte-identical row path (C1/X1).
 */
export function resolveSidebarWorktreeFolders(args: {
  worktrees: readonly Worktree[]
  repos: readonly Repo[]
  repoMap: ReadonlyMap<string, Repo>
  settings: FolderSettings | undefined
  lineageById: Record<string, WorktreeLineage>
  cyclicLineageIds: ReadonlySet<string>
  defaultHostId: ExecutionHostId
  runtimeStatusByEnvironmentId?: WorktreeFolderRuntimeStatusLookup | null
}): SidebarWorktreeFolderModel | null {
  if (args.settings?.experimentalWorktreeFolders !== true) {
    return null
  }
  const worktreesByHostRepo = new Map<string, { hostId: ExecutionHostId; worktrees: Worktree[] }>()
  for (const worktree of args.worktrees) {
    const hostId = getWorktreeExecutionHostId(
      worktree,
      args.repoMap.get(worktree.repoId),
      args.defaultHostId
    )
    const key = worktreeFolderHostRepoKey(hostId, worktree.repoId)
    const slot = worktreesByHostRepo.get(key)
    if (slot) {
      slot.worktrees.push(worktree)
    } else {
      worktreesByHostRepo.set(key, { hostId, worktrees: [worktree] })
    }
  }

  const byHostRepo = new Map<string, SidebarWorktreeFolderProject>()
  for (const [key, slot] of worktreesByHostRepo) {
    if (isWorktreeFolderEmissionSuppressedForHost(slot.hostId, args.runtimeStatusByEnvironmentId)) {
      continue
    }
    const repoId = slot.worktrees[0].repoId
    // Host-correct record first; a worktree carrying the focused default host can
    // still belong to a repo registered without one, so fall back to the sole
    // (or focused-host-unambiguous) record instead of dropping its folders.
    const repo =
      findRepoForHost(args.repos, repoId, { hostId: slot.hostId }) ??
      findRepoForHost(args.repos, repoId, { settings: args.settings })
    if (!repo?.worktreeFolders?.length) {
      continue
    }
    byHostRepo.set(key, {
      hostId: slot.hostId,
      repo,
      resolved: resolveWorktreeFolderTreeForProject({
        repo,
        worktrees: slot.worktrees,
        lineageById: args.lineageById,
        cyclicLineageIds: args.cyclicLineageIds
      })
    })
  }
  return byHostRepo.size > 0 ? { byHostRepo } : null
}

/** The window's folder model for the shared row planner; null when folders are off or unused. */
export function useSidebarWorktreeFolderModel(args: {
  worktrees: readonly Worktree[]
  repos: readonly Repo[]
  repoMap: ReadonlyMap<string, Repo>
  settings: FolderSettings | undefined
  lineageById: Record<string, WorktreeLineage>
  worktreeMap: Map<string, Worktree>
  defaultHostId: ExecutionHostId
  runtimeStatusByEnvironmentId?: WorktreeFolderRuntimeStatusLookup | null
}): SidebarWorktreeFolderModel | null {
  const {
    worktrees,
    repos,
    repoMap,
    settings,
    lineageById,
    worktreeMap,
    defaultHostId,
    runtimeStatusByEnvironmentId
  } = args
  return useMemo(
    () =>
      resolveSidebarWorktreeFolders({
        worktrees,
        repos,
        repoMap,
        settings,
        lineageById,
        cyclicLineageIds: getCyclicProjectedWorktreeLineageIds(lineageById, worktreeMap),
        defaultHostId,
        runtimeStatusByEnvironmentId
      }),
    [
      worktrees,
      repos,
      repoMap,
      settings,
      lineageById,
      worktreeMap,
      defaultHostId,
      runtimeStatusByEnvironmentId
    ]
  )
}
