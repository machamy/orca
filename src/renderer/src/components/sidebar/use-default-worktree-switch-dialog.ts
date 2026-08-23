import { useCallback, useState } from 'react'
import type { Worktree } from '../../../../shared/worktree/types'
import type { Repo } from '../../../../shared/repo-types'
import type { RuntimeDefaultWorktreeSwitchResult } from '../../../../shared/runtime-types'
import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import type {
  DefaultWorktreeSwitchConfirmOptions,
  DefaultWorktreeSwitchDialogRequest
} from './DefaultWorktreeSwitchDialog'
import { runDefaultWorktreeSwitchFlow } from '@/lib/default-worktree-switch-flow'
import { canSwitchWorktreeToDefault } from './default-worktree-switch-eligibility'

/** Fork: default-worktree switch UI state — a card's context-menu request opens
 *  the confirm dialog; the flow itself owns sleep/swap/wake. */
export function useDefaultWorktreeSwitchDialog(
  repoMap: ReadonlyMap<string, Repo>,
  visibleWorktrees: readonly Worktree[]
): {
  defaultSwitchDropTargetId: string | null
  findDefaultWorktree: (repoId: string) => Worktree | undefined
  defaultSwitchDialogRequest: DefaultWorktreeSwitchDialogRequest | null
  setDefaultSwitchDialogRequest: (request: DefaultWorktreeSwitchDialogRequest | null) => void
  requestDefaultSwitch: (source: Worktree) => void
  confirmDefaultSwitch: (
    request: DefaultWorktreeSwitchDialogRequest,
    options: DefaultWorktreeSwitchConfirmOptions
  ) => Promise<RuntimeDefaultWorktreeSwitchResult>
} {
  const [defaultSwitchDropTargetId] = useState<string | null>(null)
  const [defaultSwitchDialogRequest, setDefaultSwitchDialogRequest] =
    useState<DefaultWorktreeSwitchDialogRequest | null>(null)
  const findDefaultWorktree = useCallback(
    (repoId: string) => {
      const repo = repoMap.get(repoId)
      const defaultPath = repo ? normalizeRuntimePathForComparison(repo.path) : null
      return visibleWorktrees.find(
        (worktree) =>
          worktree.repoId === repoId &&
          defaultPath !== null &&
          normalizeRuntimePathForComparison(worktree.path) === defaultPath
      )
    },
    [repoMap, visibleWorktrees]
  )
  const requestDefaultSwitch = useCallback(
    (source: Worktree) => {
      const currentDefault = findDefaultWorktree(source.repoId)
      const repo = repoMap.get(source.repoId)
      if (
        !currentDefault ||
        !canSwitchWorktreeToDefault({ source, target: currentDefault, repo, draggedCount: 1 })
      ) {
        return
      }
      setDefaultSwitchDialogRequest({ source, currentDefault })
    },
    [findDefaultWorktree, repoMap]
  )
  const confirmDefaultSwitch = useCallback(
    async (
      request: DefaultWorktreeSwitchDialogRequest,
      options: DefaultWorktreeSwitchConfirmOptions
    ) =>
      runDefaultWorktreeSwitchFlow(
        { source: request.source, currentDefault: request.currentDefault },
        {
          agentsFollow: options.agentsFollow,
          notifyAgents: options.notifyAgents,
          notifyScope: options.notifyScope,
          sleepInPlace: options.sleepInPlace,
          includeUntracked: options.includeUntracked
        }
      ),
    []
  )
  return {
    defaultSwitchDropTargetId,
    findDefaultWorktree,
    defaultSwitchDialogRequest,
    setDefaultSwitchDialogRequest,
    requestDefaultSwitch,
    confirmDefaultSwitch
  }
}
