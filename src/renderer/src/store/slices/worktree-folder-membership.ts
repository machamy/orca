import { toast } from 'sonner'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import {
  getRepoExecutionHostId,
  getWorktreeExecutionHostId
} from '../../../../shared/execution-host'
import { WORKTREE_FOLDERS_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import { translate } from '@/i18n/i18n'
import {
  getActiveRuntimeTarget,
  runtimeEnvironmentSupportsCapability
} from '../../runtime/runtime-rpc-client'
import type { AppState } from '../types'
import { applyWorktreeUpdates } from './worktree-helpers'
import { applyDetectedWorktreeUpdates } from './worktrees/listing/detected-worktree-meta'
import { trySettingsForWorktreeOwner } from './worktrees/listing/worktree-owner-settings'
import { persistWorktreeMeta } from './worktrees/metadata/worktree-meta-persist'

type MembershipState = Pick<AppState, 'worktreesByRepo' | 'detectedWorktreesByRepo'>
type MembershipSet = (
  updater: (
    state: MembershipState & Pick<AppState, 'sortEpoch'>
  ) => Partial<MembershipState & Pick<AppState, 'sortEpoch'>>
) => void

/**
 * Fork B8a: RAW direct members — worktrees whose *stored* `worktreeFolderId`
 * names this folder. Reads the detected list too, because a worktree hidden by
 * visibility settings is absent from `worktreesByRepo` yet keeps its persisted
 * membership; a delete that only unfiles visible rows leaves it dangling.
 * Host-scoped to the owning repo row: same repo/folder ids can exist on two
 * hosts, and deleting one host's folder must not unfile the other host's rows.
 */
export function collectRawWorktreeFolderMemberIds(
  state: MembershipState,
  repo: Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>,
  folderId: string
): string[] {
  const repoHostId = getRepoExecutionHostId(repo)
  const memberIds = new Set<string>()
  const collect = (worktrees: readonly Worktree[] | undefined): void => {
    for (const worktree of worktrees ?? []) {
      if (
        worktree.repoId === repo.id &&
        worktree.worktreeFolderId === folderId &&
        // Same precedence as the sidebar model: a row's own stamp wins, an
        // unstamped row falls back to its repo's host.
        getWorktreeExecutionHostId(worktree, repo) === repoHostId
      ) {
        memberIds.add(worktree.id)
      }
    }
  }
  collect(state.worktreesByRepo[repo.id])
  collect(state.detectedWorktreesByRepo[repo.id]?.worktrees)
  return [...memberIds]
}

export function showWorktreeFolderHostUpdateToast(): void {
  toast.error(
    translate(
      'auto.store.slices.worktreeFolderMembership.hostUpdateRequired',
      'Update the remote Orca server to use worktree folders'
    )
  )
}

function showWorktreeFolderMembershipFailedToast(): void {
  toast.error(
    translate(
      'auto.store.slices.worktreeFolderMembership.writeFailed',
      'Failed to update worktree folder membership'
    )
  )
}

/** True when writes may proceed; an unreachable status check reads as unsupported. */
export async function environmentSupportsWorktreeFolders(environmentId: string): Promise<boolean> {
  try {
    return await runtimeEnvironmentSupportsCapability(
      environmentId,
      WORKTREE_FOLDERS_RUNTIME_CAPABILITY
    )
  } catch {
    return false
  }
}

function applyMembershipEntries(
  set: MembershipSet,
  entries: ReadonlyMap<string, string | undefined>
): void {
  if (entries.size === 0) {
    return
  }
  set((s) => {
    let nextWorktrees = s.worktreesByRepo
    let nextDetected = s.detectedWorktreesByRepo
    for (const [worktreeId, folderId] of entries) {
      nextWorktrees = applyWorktreeUpdates(nextWorktrees, worktreeId, {
        worktreeFolderId: folderId
      })
      nextDetected = applyDetectedWorktreeUpdates(nextDetected, worktreeId, {
        worktreeFolderId: folderId
      })
    }
    if (nextWorktrees === s.worktreesByRepo && nextDetected === s.detectedWorktreesByRepo) {
      return {}
    }
    return {
      worktreesByRepo: nextWorktrees,
      detectedWorktreesByRepo: nextDetected,
      // Mirrors updateWorktreesMeta: membership moves rows between groups.
      sortEpoch: s.sortEpoch + 1
    }
  })
}

function findMembershipValue(state: MembershipState, worktreeId: string): string | undefined {
  for (const worktrees of Object.values(state.worktreesByRepo)) {
    const match = worktrees.find((worktree) => worktree.id === worktreeId)
    if (match) {
      return match.worktreeFolderId
    }
  }
  for (const detected of Object.values(state.detectedWorktreesByRepo)) {
    const match = detected.worktrees.find((worktree) => worktree.id === worktreeId)
    if (match) {
      return match.worktreeFolderId
    }
  }
  return undefined
}

// Latest-write-wins per worktree: a slow persist's FAILURE rollback must not
// clobber the outcome of a write issued after it.
const membershipWriteGenerationByWorktreeId = new Map<string, number>()
let nextMembershipWriteGeneration = 1

/**
 * Fork G4a: membership writes own their failure path instead of riding
 * `updateWorktreesMeta`, which catches every error, logs, and resolves as if it
 * succeeded. On a paired host that does not advertise `worktree.folders.v1`:
 * the folder RPC is never issued, no optimistic state survives, and exactly one
 * "update the host" toast is shown. Persist failures revert only the failed ids
 * whose write is still the worktree's LATEST — a newer write owns the state.
 */
export async function writeWorktreeFolderMembership(
  set: MembershipSet,
  get: () => AppState,
  entries: ReadonlyMap<string, string | undefined>
): Promise<boolean> {
  if (entries.size === 0) {
    return true
  }
  const state = get()
  const capabilityByEnvironment = new Map<string, boolean>()
  const allowed = new Map<string, string | undefined>()
  const ownerSettingsById = new Map<string, AppState['settings']>()
  let blocked = false
  let unresolvedOwner = false
  for (const [worktreeId, folderId] of entries) {
    // Null = ambiguous/unknown owner route; refuse rather than guessing a host.
    const ownerSettings = trySettingsForWorktreeOwner(state, worktreeId)
    if (ownerSettings === null) {
      unresolvedOwner = true
      continue
    }
    const target = getActiveRuntimeTarget(ownerSettings)
    if (target.kind === 'environment') {
      let supported = capabilityByEnvironment.get(target.environmentId)
      if (supported === undefined) {
        supported = await environmentSupportsWorktreeFolders(target.environmentId)
        capabilityByEnvironment.set(target.environmentId, supported)
      }
      if (!supported) {
        blocked = true
        continue
      }
    }
    ownerSettingsById.set(worktreeId, ownerSettings)
    allowed.set(worktreeId, folderId)
  }
  if (blocked) {
    showWorktreeFolderHostUpdateToast()
  }
  if (unresolvedOwner) {
    showWorktreeFolderMembershipFailedToast()
  }

  const current = get()
  const previous = new Map<string, string | undefined>()
  const writeGenerationById = new Map<string, number>()
  for (const worktreeId of allowed.keys()) {
    previous.set(worktreeId, findMembershipValue(current, worktreeId))
    const generation = nextMembershipWriteGeneration++
    membershipWriteGenerationByWorktreeId.set(worktreeId, generation)
    writeGenerationById.set(worktreeId, generation)
  }
  applyMembershipEntries(set, allowed)

  const failedIds: string[] = []
  await Promise.all(
    [...allowed].map(async ([worktreeId, folderId]) => {
      try {
        // Present-but-undefined is the wire signal for "unfile", all the way down.
        await persistWorktreeMeta(ownerSettingsById.get(worktreeId) ?? get().settings, worktreeId, {
          worktreeFolderId: folderId
        })
      } catch (err) {
        console.error('Failed to persist worktree folder membership:', err)
        failedIds.push(worktreeId)
      }
    })
  )
  if (failedIds.length > 0) {
    // A superseded id is skipped: rolling it back would overwrite the newer write.
    const rollbackIds = failedIds.filter(
      (worktreeId) =>
        membershipWriteGenerationByWorktreeId.get(worktreeId) ===
        writeGenerationById.get(worktreeId)
    )
    applyMembershipEntries(
      set,
      new Map(rollbackIds.map((worktreeId) => [worktreeId, previous.get(worktreeId)]))
    )
    if (!unresolvedOwner) {
      showWorktreeFolderMembershipFailedToast()
    }
  }
  return !blocked && !unresolvedOwner && failedIds.length === 0
}
