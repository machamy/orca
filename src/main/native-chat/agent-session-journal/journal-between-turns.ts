import type { AgentSessionJournal } from './journal-store'

/** Host lines go between turns, never into one: a turn running or about to start waits for its end. */
export function journalRestsBetweenTurns(
  journal: Pick<AgentSessionJournal, 'newestTurn' | 'pendingSubmissions'>
): boolean {
  return journal.newestTurn()?.state !== 'running' && journal.pendingSubmissions().length === 0
}
