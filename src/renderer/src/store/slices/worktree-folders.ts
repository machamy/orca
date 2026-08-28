import type { StateCreator } from 'zustand'
import type { Repo } from '../../../../shared/repo-types'
import type { WorktreeFolder } from '../../../../shared/worktree-folder/types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import { getActiveRuntimeTarget } from '../../runtime/runtime-client-target'
import type { AppState } from '../types'
import { findRepoForHost, getRepoHostIdentity } from './repo-host-identity'
import {
  collectRawWorktreeFolderMemberIds,
  environmentSupportsWorktreeFolders,
  showWorktreeFolderHostUpdateToast,
  writeWorktreeFolderMembership
} from './worktree-folder-membership'
import { settingsForKnownRepoOwner } from './worktrees/listing/worktree-owner-settings'

export type WorktreeFolderWriteOptions = {
  /** Names the owning host row when the same repo id exists on several hosts. */
  hostId?: ExecutionHostId | (string & {}) | null
}

/**
 * Fork: CRUD for `Repo.worktreeFolders` and for the `worktreeFolderId`
 * membership on each workspace. Folder records live on the repo; membership
 * lives on the workspace, so nothing here has to keep two id lists in step.
 *
 * Record mutations are serialized per repo-host and re-read the folder list at
 * commit time — a snapshot taken before an await loses concurrent writes even
 * when the underlying `updateRepo` calls are serialized.
 */
export type WorktreeFolderSlice = {
  /** Resolves to the new folder, or null when the project is unknown or the write was refused. */
  createWorktreeFolder: (
    repoId: string,
    args: { name: string; parentFolderId?: string | null },
    options?: WorktreeFolderWriteOptions
  ) => Promise<WorktreeFolder | null>
  renameWorktreeFolder: (
    repoId: string,
    folderId: string,
    name: string,
    options?: WorktreeFolderWriteOptions
  ) => Promise<boolean>
  /**
   * Deletes no workspace: RAW direct members (hidden ones included) are
   * un-filed, and child folders are promoted to the deleted folder's parent.
   */
  deleteWorktreeFolder: (
    repoId: string,
    folderId: string,
    options?: WorktreeFolderWriteOptions
  ) => Promise<boolean>
  /** Ranks the listed siblings in the given order. Folders not listed keep their order. */
  reorderWorktreeFolders: (
    repoId: string,
    orderedFolderIds: readonly string[],
    options?: WorktreeFolderWriteOptions
  ) => Promise<boolean>
  /** `null` moves to top level. Refuses self- and descendant-cycles. */
  reparentWorktreeFolder: (
    repoId: string,
    folderId: string,
    parentFolderId: string | null,
    options?: WorktreeFolderWriteOptions
  ) => Promise<boolean>
  /** `null` un-files. Ignores workspaces whose host-correct project has no such folder. */
  setWorktreeFolderMembership: (
    worktreeIds: readonly string[],
    folderId: string | null
  ) => Promise<boolean>
}

const MAX_WORKTREE_FOLDER_NAME_LENGTH = 200

function newWorktreeFolderId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `worktree-folder-${Date.now()}-${Math.random()}`
}

/** Siblings are ranked highest-first, so a new folder starts above the rest. */
function nextWorktreeFolderManualOrder(folders: readonly WorktreeFolder[]): number {
  return folders.reduce((highest, folder) => Math.max(highest, folder.manualOrder ?? 0), 0) + 1
}

/**
 * True when filing `folderId` under `nextParentId` would loop — the target is
 * the folder itself or one of its descendants. Visited-set guard so persisted
 * cycles cannot hang the check.
 */
export function wouldCreateWorktreeFolderCycle(
  folders: readonly WorktreeFolder[],
  folderId: string,
  nextParentId: string | null
): boolean {
  if (nextParentId === null) {
    return false
  }
  const parentById = new Map(
    folders.map((folder) => [folder.id, folder.parentFolderId ?? null] as const)
  )
  const visited = new Set<string>()
  let currentId: string | null = nextParentId
  while (currentId !== null && !visited.has(currentId)) {
    if (currentId === folderId) {
      return true
    }
    visited.add(currentId)
    currentId = parentById.get(currentId) ?? null
  }
  return false
}

/** Recipe result: the next list, `null` to refuse, `'unchanged'` to succeed without a write. */
type WorktreeFolderRecipeResult = WorktreeFolder[] | null | 'unchanged'

export const createWorktreeFolderSlice: StateCreator<AppState, [], [], WorktreeFolderSlice> = (
  set,
  get
) => {
  const repoFor = (repoId: string, options?: WorktreeFolderWriteOptions): Repo | null =>
    findRepoForHost(get().repos, repoId, {
      hostId: options?.hostId ?? undefined,
      settings: get().settings
    })

  // Fork G4: the paired-runtime path zod-strips unknown keys and reports
  // success, so record writes require the host capability. Local and direct-SSH
  // repos route over local IPC and are never gated.
  const environmentIdForRepoWrite = (repo: Repo): string | null => {
    // The already-resolved host-correct row decides routing; a bare-id re-lookup
    // could answer with a same-id row on another host.
    const target = getActiveRuntimeTarget(settingsForKnownRepoOwner(get().settings, repo))
    return target.kind === 'environment' ? target.environmentId : null
  }

  const mutationChains = new Map<string, Promise<boolean>>()

  const mutateFolders = (
    repoId: string,
    options: WorktreeFolderWriteOptions | undefined,
    recipe: (folders: WorktreeFolder[]) => WorktreeFolderRecipeResult
  ): Promise<boolean> => {
    const chainRepo = repoFor(repoId, options)
    if (!chainRepo) {
      return Promise.resolve(false)
    }
    const chainKey = getRepoHostIdentity(chainRepo)
    const run = async (): Promise<boolean> => {
      // Commit-time re-read: the previous chained write has already landed its
      // echo in the store, so this recipe never operates on a stale snapshot.
      const repo = repoFor(repoId, options)
      if (!repo) {
        return false
      }
      const next = recipe([...(repo.worktreeFolders ?? [])])
      if (next === null) {
        return false
      }
      if (next === 'unchanged') {
        return true
      }
      const environmentId = environmentIdForRepoWrite(repo)
      if (environmentId && !(await environmentSupportsWorktreeFolders(environmentId))) {
        showWorktreeFolderHostUpdateToast()
        return false
      }
      return get().updateRepo(
        repoId,
        { worktreeFolders: next },
        options?.hostId ? { hostId: options.hostId as ExecutionHostId } : undefined
      )
    }
    const previous = mutationChains.get(chainKey)
    const nextPromise = previous ? previous.catch(() => false).then(run) : run()
    mutationChains.set(chainKey, nextPromise)
    const cleanup = (): void => {
      if (mutationChains.get(chainKey) === nextPromise) {
        mutationChains.delete(chainKey)
      }
    }
    void nextPromise.then(cleanup, cleanup)
    return nextPromise
  }

  return {
    createWorktreeFolder: async (repoId, args, options) => {
      let created: WorktreeFolder | null = null
      const persisted = await mutateFolders(repoId, options, (folders) => {
        const name = args.name.trim().slice(0, MAX_WORKTREE_FOLDER_NAME_LENGTH)
        if (!name) {
          return null
        }
        const parentFolderId =
          args.parentFolderId && folders.some((folder) => folder.id === args.parentFolderId)
            ? args.parentFolderId
            : null
        const siblings = folders.filter(
          (folder) => (folder.parentFolderId ?? null) === parentFolderId
        )
        created = {
          id: newWorktreeFolderId(),
          name,
          parentFolderId,
          manualOrder: nextWorktreeFolderManualOrder(siblings),
          createdAt: Date.now()
        }
        return [...folders, created]
      })
      return persisted ? created : null
    },

    renameWorktreeFolder: async (repoId, folderId, name, options) =>
      mutateFolders(repoId, options, (folders) => {
        const trimmed = name.trim().slice(0, MAX_WORKTREE_FOLDER_NAME_LENGTH)
        if (!trimmed || !folders.some((folder) => folder.id === folderId)) {
          return null
        }
        return folders.map((folder) =>
          folder.id === folderId ? { ...folder, name: trimmed } : folder
        )
      }),

    deleteWorktreeFolder: async (repoId, folderId, options) => {
      const repo = repoFor(repoId, options)
      if (!repo?.worktreeFolders?.some((folder) => folder.id === folderId)) {
        return false
      }
      // B8/G4a: unfile BEFORE dropping the record — a failed unfile with the
      // record already gone would leave persisted membership naming a folder
      // that no longer exists, while the dialog promised clean state.
      const memberIds = collectRawWorktreeFolderMemberIds(get(), repo, folderId)
      const unfiled = await writeWorktreeFolderMembership(
        set,
        get,
        new Map(memberIds.map((worktreeId) => [worktreeId, undefined]))
      )
      if (!unfiled) {
        return false
      }
      return mutateFolders(repoId, options, (folders) => {
        const deleted = folders.find((folder) => folder.id === folderId)
        if (!deleted) {
          return null
        }
        // Promote, don't orphan: a child left pointing at the deleted id resolves to
        // top level and loses the grandparent the user actually chose.
        const promotedParentId = deleted.parentFolderId ?? null
        return folders
          .filter((folder) => folder.id !== folderId)
          .map((folder) =>
            folder.parentFolderId === folderId
              ? { ...folder, parentFolderId: promotedParentId }
              : folder
          )
      })
    },

    reorderWorktreeFolders: async (repoId, orderedFolderIds, options) =>
      mutateFolders(repoId, options, (folders) => {
        if (orderedFolderIds.length === 0) {
          return null
        }
        const rankById = new Map(
          orderedFolderIds.map((folderId, index) => [folderId, orderedFolderIds.length - index])
        )
        let changed = false
        const next = folders.map((folder) => {
          const manualOrder = rankById.get(folder.id)
          if (manualOrder === undefined || folder.manualOrder === manualOrder) {
            return folder
          }
          changed = true
          return { ...folder, manualOrder }
        })
        return changed ? next : 'unchanged'
      }),

    reparentWorktreeFolder: async (repoId, folderId, parentFolderId, options) =>
      mutateFolders(repoId, options, (folders) => {
        const folder = folders.find((candidate) => candidate.id === folderId)
        if (!folder) {
          return null
        }
        const nextParentId =
          parentFolderId && folders.some((candidate) => candidate.id === parentFolderId)
            ? parentFolderId
            : null
        if (parentFolderId !== null && nextParentId === null) {
          return null
        }
        if ((folder.parentFolderId ?? null) === nextParentId) {
          return 'unchanged'
        }
        if (wouldCreateWorktreeFolderCycle(folders, folderId, nextParentId)) {
          return null
        }
        const newSiblings = folders.filter(
          (candidate) =>
            candidate.id !== folderId && (candidate.parentFolderId ?? null) === nextParentId
        )
        return folders.map((candidate) =>
          candidate.id === folderId
            ? {
                ...candidate,
                parentFolderId: nextParentId,
                manualOrder: nextWorktreeFolderManualOrder(newSiblings)
              }
            : candidate
        )
      }),

    setWorktreeFolderMembership: async (worktreeIds, folderId) => {
      if (worktreeIds.length === 0) {
        return true
      }
      const state = get()
      const entries = new Map<string, string | undefined>()
      for (const worktreeId of worktreeIds) {
        if (folderId !== null) {
          const repoId = getRepoIdFromWorktreeId(worktreeId)
          // Host-correct record: a same-id repo row on another host must not
          // answer for whether this row's project has the folder.
          const hostId =
            state.worktreesByRepo[repoId]?.find((worktree) => worktree.id === worktreeId)?.hostId ??
            state.detectedWorktreesByRepo[repoId]?.worktrees.find(
              (worktree) => worktree.id === worktreeId
            )?.hostId
          const repo = findRepoForHost(state.repos, repoId, {
            hostId,
            settings: state.settings
          })
          if (!repo?.worktreeFolders?.some((folder) => folder.id === folderId)) {
            continue
          }
        }
        // Present-but-undefined is the clear signal all the way down to worktree.set.
        entries.set(worktreeId, folderId ?? undefined)
      }
      return writeWorktreeFolderMembership(set, get, entries)
    }
  }
}
