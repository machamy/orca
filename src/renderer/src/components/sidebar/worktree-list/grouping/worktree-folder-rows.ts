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
import type { WorktreeFolder } from '../../../../../../shared/worktree-folder/types'
import { findRepoForHost } from '../../../../store/slices/repo-host-identity'
import { getProjectedWorktreeLineage } from '../../worktree-lineage-projection'
import { appendWorktreeRows } from './row-builders'
import type { Row, WorktreeGroupBy } from './row-types'

/** Collapse-state key — id-scoped (F4): one key folds every row of the folder. */
export function getWorktreeFolderGroupKey(folderId: string): string {
  return `worktree-folder:${folderId}`
}

/**
 * Where folder rows render (§6). Exhaustive on purpose — a new `WorktreeGroupBy`
 * variant must fail here, not silently hide folders (the #15362 lesson).
 * Status/PR lanes are the `'hide'` default; `'repeat-header'` is a later stage.
 */
export function shouldRenderWorktreeFoldersForGroupBy(groupBy: WorktreeGroupBy): boolean {
  switch (groupBy) {
    case 'none':
    case 'repo':
      return true
    case 'workspace-status':
    case 'pr-status':
      return false
  }
}

type SidebarWorktreeFolderProject = {
  hostId: ExecutionHostId
  repo: Repo
  resolved: ResolvedWorktreeFolderTree
}

/** One resolver pass per project per host (§6); lanes only read the answer. */
export type SidebarWorktreeFolderModel = {
  byHostRepo: ReadonlyMap<string, SidebarWorktreeFolderProject>
}

// Escaped NUL, never the raw byte: a raw \x00 makes git/diff read the file as binary.
function hostRepoKey(hostId: ExecutionHostId, repoId: string): string {
  return `${hostId}\u0000${repoId}`
}

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
    const key = hostRepoKey(hostId, worktree.repoId)
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

type AppendWorktreeRowsOptions = Parameters<typeof appendWorktreeRows>[5]

/**
 * §6 — the one place a folder becomes row-shaped. Emits, per project-per-host
 * block in first-appearance order: one `WorktreeFolderRow` per folder
 * (depth-first, siblings in resolver order), each followed by its members via
 * the existing `appendWorktreeRows`, then all unfiled worktrees in one final
 * call — today's behaviour, byte for byte, when there are no folders.
 */
export function appendWorktreeRowsWithFolders(
  result: Row[],
  worktrees: Worktree[],
  repoMap: Map<string, Repo>,
  lineageById: Record<string, WorktreeLineage>,
  worktreeMap: Map<string, Worktree>,
  options: AppendWorktreeRowsOptions & {
    groupBy: WorktreeGroupBy
    defaultHostId: ExecutionHostId
  },
  model: SidebarWorktreeFolderModel | null
): void {
  const { groupBy: _groupBy, defaultHostId: _defaultHostId, ...baseOptions } = options
  if (!model || !shouldRenderWorktreeFoldersForGroupBy(options.groupBy)) {
    appendWorktreeRows(result, worktrees, repoMap, lineageById, worktreeMap, baseOptions)
    return
  }

  const blockKeys: string[] = []
  const membersByBlockFolder = new Map<string, Worktree[]>()
  const unfiled: Worktree[] = []
  for (const worktree of worktrees) {
    const hostId = getWorktreeExecutionHostId(
      worktree,
      repoMap.get(worktree.repoId),
      options.defaultHostId
    )
    const blockKey = hostRepoKey(hostId, worktree.repoId)
    const project = model.byHostRepo.get(blockKey)
    if (!project) {
      unfiled.push(worktree)
      continue
    }
    if (!blockKeys.includes(blockKey)) {
      blockKeys.push(blockKey)
    }
    const folderId = project.resolved.folderIdByWorktreeId.get(worktree.id)
    if (!folderId) {
      unfiled.push(worktree)
      continue
    }
    const memberKey = `${blockKey}\u0000${folderId}`
    const members = membersByBlockFolder.get(memberKey)
    if (members) {
      members.push(worktree)
    } else {
      membersByBlockFolder.set(memberKey, [worktree])
    }
  }

  if (blockKeys.length === 0) {
    appendWorktreeRows(result, worktrees, repoMap, lineageById, worktreeMap, baseOptions)
    return
  }

  // Iterative depth-first pre-order: folder depth is unbounded by design, so a
  // deep-but-valid persisted chain must never overflow the call stack.
  const emitFolderBlock = (blockKey: string, project: SidebarWorktreeFolderProject): void => {
    type Level = { folders: readonly WorktreeFolder[]; index: number; folderDepth: number }
    const stack: Level[] = [
      { folders: project.resolved.foldersByParentId.get(null) ?? [], index: 0, folderDepth: 0 }
    ]
    for (;;) {
      const level = stack.at(-1)
      if (!level) {
        break
      }
      if (level.index >= level.folders.length) {
        stack.pop()
        continue
      }
      const folder = level.folders[level.index]
      level.index += 1
      const members = membersByBlockFolder.get(`${blockKey}\u0000${folder.id}`) ?? []
      const collapsed = baseOptions.collapsedGroups.has(getWorktreeFolderGroupKey(folder.id))
      result.push({
        type: 'worktree-folder',
        key: `worktree-folder:${project.hostId}:${baseOptions.sectionKey}:${folder.id}:0`,
        folder,
        repo: project.repo,
        hostId: project.hostId,
        sectionKey: baseOptions.sectionKey,
        groupDepth: baseOptions.groupDepth,
        folderDepth: level.folderDepth,
        memberCount: members.length,
        collapsed
      })
      if (collapsed) {
        continue
      }
      if (members.length > 0) {
        appendWorktreeRows(result, members, repoMap, lineageById, worktreeMap, {
          ...baseOptions,
          worktreeFolderDepth: level.folderDepth + 1
        })
      }
      const children = project.resolved.foldersByParentId.get(folder.id)
      if (children && children.length > 0) {
        stack.push({ folders: children, index: 0, folderDepth: level.folderDepth + 1 })
      }
    }
  }

  for (const blockKey of blockKeys) {
    const project = model.byHostRepo.get(blockKey)
    if (project) {
      emitFolderBlock(blockKey, project)
    }
  }
  appendWorktreeRows(result, unfiled, repoMap, lineageById, worktreeMap, baseOptions)
}
