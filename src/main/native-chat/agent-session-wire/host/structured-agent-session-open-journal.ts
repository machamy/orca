import type { AgentSessionJournal } from '../../agent-session-journal/journal-store'
import { getStructuredAgentSessionHost } from './structured-agent-session-registry'

/** The open chat's journal, if any: the publication feed hands a new observer it at once. */
export function openStructuredChatJournal(chatId: string): AgentSessionJournal | null {
  let journal: AgentSessionJournal | null = null
  getStructuredAgentSessionHost()?.observeConversationPublications(chatId, {
    next: (hint) => (journal ??= hint.journal),
    error: () => {}
  })?.()
  return journal
}
