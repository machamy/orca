import type { RuntimeNotifier } from '../runtime/client/events/runtime-notifier-contract'

type RendererSend = (channel: string, ...values: unknown[]) => boolean

/** Fork: renderer relay for the Unity auto-seed offer. */
export function createForkRuntimeNotifierEvents(
  send: RendererSend
): Pick<RuntimeNotifier, 'unityAutoSeedOffer'> {
  return {
    unityAutoSeedOffer: (repoId, worktreePath) =>
      send('ui:unityAutoSeedOffer', { repoId, worktreePath })
  }
}
