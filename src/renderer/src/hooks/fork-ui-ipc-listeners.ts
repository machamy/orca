import { toast } from 'sonner'
import { useAppStore } from '../store'
import { translate } from '@/i18n/i18n'
import { recordRendererCrashBreadcrumb } from '@/lib/crash-breadcrumb-recorder'
import { runDefaultWorktreeSwitchFlow } from '@/lib/default-worktree-switch-flow'
import { areRuntimePathsEqual } from '../../../shared/worktree/ownership'

/**
 * Fork: the Unity auto-seed offer + CLI default-switch UI IPC listeners.
 * A plain function, called inside useIpcEvents' effect where the blocks used
 * to sit, so registration order and the cleanup boundary are unchanged.
 * Optional-chained because desktop preloads older than these fork APIs
 * omit them (the web preload stubs both).
 */
export function registerForkUiIpcListeners(): (() => void)[] {
  const unsubs: (() => void)[] = []

  const unityOfferUnsub = window.api.ui.onUnityAutoSeedOffer?.(({ repoId, worktreePath }) => {
    // First Unity worktree for a repo with no stored choice: ask once, and
    // say where the setting lives so "later" is a real option.
    const applyChoice = (autoSeed: boolean) => {
      void useAppStore
        .getState()
        .updateRepo(repoId, { unityAutoSeedCache: autoSeed })
        .catch(() => undefined)
      if (!autoSeed) {
        return
      }
      const repo = useAppStore.getState().repos.find((candidate) => candidate.id === repoId)
      if (!repo) {
        return
      }
      void window.api.unity
        .seedWorktreeCache({ worktreePath, sourcePath: repo.path })
        .then((result) => {
          if (result.seeded) {
            toast.success(
              translate(
                'auto.hooks.useIpcEvents.unityAutoSeeded',
                'Unity cache copied — this repo now seeds every new worktree'
              )
            )
          } else {
            toast.error(
              translate(
                'auto.hooks.useIpcEvents.unityAutoSeedFailed',
                'Unity cache copy did not run ({{reason}}) — use the worktree context menu to retry',
                { reason: result.reason }
              )
            )
          }
        })
        .catch(() => undefined)
    }
    toast(
      translate(
        'auto.hooks.useIpcEvents.unityAutoSeedOfferTitle',
        'Copy the Unity cache into new worktrees of this project?'
      ),
      {
        description: translate(
          'auto.hooks.useIpcEvents.unityAutoSeedOfferBody',
          'Skips the full first-open reimport. You can change this anytime from the project’s ⋯ menu.'
        ),
        duration: 30_000,
        action: {
          label: translate('auto.hooks.useIpcEvents.unityAutoSeedYes', 'Always copy'),
          onClick: () => applyChoice(true)
        },
        cancel: {
          label: translate('auto.hooks.useIpcEvents.unityAutoSeedNo', 'Not for this project'),
          onClick: () => applyChoice(false)
        }
      }
    )
  })
  if (unityOfferUnsub) {
    unsubs.push(unityOfferUnsub)
  }

  const defaultSwitchRequestUnsub = window.api.ui.onDefaultWorktreeSwitchRequest?.(
    ({ repoId, worktreeId, followAgents, notifyAgents, includeUntracked }) => {
      const state = useAppStore.getState()
      const repo = state.repos.find((candidate) => candidate.id === repoId)
      const rows = state.worktreesByRepo[repoId] ?? []
      const source = rows.find((row) => row.id === worktreeId)
      const currentDefault = repo
        ? rows.find((row) => areRuntimePathsEqual(row.path, repo.path))
        : undefined
      recordRendererCrashBreadcrumb('mode_b_cli_request', {
        worktreeId,
        found: Boolean(source && currentDefault)
      })
      if (!source || !currentDefault || source.id === currentDefault.id) {
        return
      }
      void runDefaultWorktreeSwitchFlow(
        { source, currentDefault },
        {
          agentsFollow: followAgents,
          notifyAgents,
          sleepInPlace: false,
          includeUntracked: includeUntracked !== false
        }
      ).catch((error) => {
        console.error('CLI default-switch flow failed:', error)
      })
    }
  )
  if (defaultSwitchRequestUnsub) {
    unsubs.push(defaultSwitchRequestUnsub)
  }

  return unsubs
}
