import type {
  AgentJournalItemBody,
  AgentJournalRenderItem,
  AgentJournalSnapshot
} from '../../../shared/agent-session/journal/agent-session-journal-types'
import { journalDomainSubmission } from './journal-domain-status-inputs'
import { journalDomainContextHead } from './journal-sql-continuation-context'
import type { JournalSqlScope } from './journal-sql-scope'

/** Host rows since the last clear that ride with a later send, and the sends that read them. */
export function readJournalDomainRideAlongRows(
  scope: JournalSqlScope,
  floor: number,
  rideOf: (body: AgentJournalItemBody) => { readWith?: string } | null
): AgentJournalSnapshot {
  const items = scope.db
    .prepare(`SELECT payload_json FROM journal_items WHERE session_id=? AND epoch=? AND hidden=0
    AND kind='status' AND sequence>? ORDER BY sequence,sequence_index,ordinal`)
    .all(...scope.prefix, floor)
    .map((row) => scope.decode<AgentJournalRenderItem>(scope.examined(row).payload_json))
    .filter((item) => rideOf(item.body) !== null)
  const readers = new Set(
    items.flatMap((item) => {
      const readWith = rideOf(item.body)?.readWith
      return readWith ? [readWith] : []
    })
  )
  return {
    sessionId: scope.sessionId,
    cursor: journalDomainContextHead(scope.db, scope),
    items,
    submissions: [...readers].flatMap((id) => journalDomainSubmission(scope, id) ?? [])
  }
}
