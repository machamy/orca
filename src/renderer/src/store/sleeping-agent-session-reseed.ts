import type { StateCreator } from 'zustand'
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import type { AppState } from './types'

export type SleepingAgentSessionReseedSlice = {
  /** Fork (mode-B default switch): re-insert captured records that swap-window
   *  churn deleted before the follow wake could read them. Additive only —
   *  a record still present in the store wins over the snapshot copy. */
  reseedSleepingAgentSessions: (records: readonly SleepingAgentSessionRecord[]) => void
}

// Why its own slice: the reseed is a fork-only recovery path bolted onto the
// agent-status collection; keeping it out of the upstream slice keeps merges cheap.
export const createSleepingAgentSessionReseedSlice: StateCreator<
  AppState,
  [],
  [],
  SleepingAgentSessionReseedSlice
> = (set) => ({
  reseedSleepingAgentSessions: (records) => {
    set((s) => {
      const missing = records.filter((record) => !s.sleepingAgentSessionsByPaneKey[record.paneKey])
      if (missing.length === 0) {
        return s
      }
      return {
        sleepingAgentSessionsByPaneKey: {
          ...s.sleepingAgentSessionsByPaneKey,
          ...Object.fromEntries(missing.map((record) => [record.paneKey, record]))
        }
      }
    })
  }
})
