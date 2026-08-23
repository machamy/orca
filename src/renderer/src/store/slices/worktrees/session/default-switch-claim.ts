import type { StoreApi } from 'zustand'
import { DEFAULT_SWITCH_IN_FLIGHT_STALE_MS } from '@/lib/default-worktree-switch-stale-bound'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { AppState } from '../../../types'

/**
 * Fork feature (default-worktree switch): the in-flight marker with owner-token
 * compare-and-set semantics. Lives beside upstream's session modules so the
 * decomposed slice keeps one home for switch concurrency state.
 */
type Set = StoreApi<AppState>['setState']

export function createDefaultSwitchClaimActions(set: Set) {
  return {
    claimDefaultSwitch: (worktreeIds, options) => {
      const admitted = options?.admitted !== false
      let granted: string | null = null
      set((s) => {
        const now = Date.now()
        const current = s.defaultSwitchInFlight
        const currentIsLive =
          !!current &&
          now - (current.heartbeatAt ?? current.startedAt) < DEFAULT_SWITCH_IN_FLIGHT_STALE_MS
        const currentIsForeignLock =
          currentIsLive && current.admitted && current.blocking && current.token !== options?.token
        if (currentIsForeignLock) {
          // A live claim by someone else: neither an admission nor a display
          // marker may touch it. The rival's card is already showing.
          return {}
        }
        if (!admitted && currentIsLive && current.admitted) {
          return {}
        }
        const token = options?.token ?? createBrowserUuid()
        granted = token
        const keepsClock = current?.token === options?.token
        return {
          defaultSwitchInFlight: {
            worktreeIds: [...worktreeIds],
            // Upgrading one's own display marker keeps its clock: the indicator
            // counts from when the switch started, not from the admission.
            startedAt: keepsClock && current ? current.startedAt : now,
            heartbeatAt: now,
            admitted,
            blocking: admitted,
            token,
            ...(options?.progress ? { progress: options.progress } : {})
          }
        }
      })
      return granted
    },

    setDefaultSwitchProgress: (progress, token) => {
      set((s) => {
        const inFlight = s.defaultSwitchInFlight
        // Owner-checked: a stage arriving late from a superseded flow must not
        // repaint (or keep alive, via the heartbeat) a claim it does not own.
        if (!inFlight || token === null || inFlight.token !== token) {
          return {}
        }
        return { defaultSwitchInFlight: { ...inFlight, progress, heartbeatAt: Date.now() } }
      })
    },

    touchDefaultSwitchHeartbeat: (token) => {
      set((s) => {
        const inFlight = s.defaultSwitchInFlight
        // Deliberately does not touch `progress`: the wake reports its own stages,
        // and a pulse that also wrote a phase dragged the card back to "swapping".
        if (!inFlight || token === null || inFlight.token !== token) {
          return {}
        }
        return { defaultSwitchInFlight: { ...inFlight, heartbeatAt: Date.now() } }
      })
    },

    downgradeDefaultSwitchBlocking: (token, progress) => {
      set((s) => {
        const inFlight = s.defaultSwitchInFlight
        if (!inFlight || token === null || inFlight.token !== token) {
          return {}
        }
        return {
          defaultSwitchInFlight: {
            ...inFlight,
            blocking: false,
            heartbeatAt: Date.now(),
            ...(progress ? { progress } : {})
          }
        }
      })
    },

    releaseDefaultSwitch: (token) => {
      set((s) => {
        const inFlight = s.defaultSwitchInFlight
        // Owner-checked: the unconditional clear let a REJECTED rival — or a
        // fallback timer from an already-superseded switch — erase the winner's
        // claim mid-git, which un-gated a third attempt into a double swap.
        if (!inFlight || token === null || inFlight.token !== token) {
          return {}
        }
        return { defaultSwitchInFlight: null }
      })
    }
  }
}
