import { toast } from 'sonner'
import { useAppStore } from '../store'
import { translate } from '@/i18n/i18n'

/**
 * Fork: the Unity auto-seed offer UI IPC listener.
 * A plain function, called inside useIpcEvents' effect where the blocks used
 * to sit, so registration order and the cleanup boundary are unchanged.
 * Optional-chained because desktop preloads older than these fork APIs
 * omit them (the web preload stubs it).
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

  return unsubs
}
