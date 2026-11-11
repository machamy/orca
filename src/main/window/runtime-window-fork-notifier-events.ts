import type { RuntimeNotifier } from '../runtime/client/events/runtime-notifier-contract'

type RendererSend = (channel: string, ...values: unknown[]) => boolean

/** Fork: renderer relays for the Unity auto-seed offer and the CLI-driven default-worktree switch. */
export function createForkRuntimeNotifierEvents(
  send: RendererSend
): Pick<RuntimeNotifier, 'unityAutoSeedOffer' | 'defaultWorktreeSwitchRequest'> {
  return {
    unityAutoSeedOffer: (repoId, worktreePath) =>
      send('ui:unityAutoSeedOffer', { repoId, worktreePath }),
    defaultWorktreeSwitchRequest: (repoId, worktreeId, opts) =>
      send('ui:defaultWorktreeSwitchRequest', {
        repoId,
        worktreeId,
        followAgents: opts.followAgents,
        notifyAgents: opts.notifyAgents,
        includeUntracked: opts.includeUntracked
      })
  }
}
