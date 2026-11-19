import type { AgentJournalMessageItem } from '../../../../shared/agent-session/journal/agent-session-journal-types'
import { agentJournalSubmissionKey } from '../../../../shared/agent-session/journal/agent-session-journal-item-key'
import {
  isNativeChatShellCommandItemId,
  nativeChatShellCommandAgentContext
} from '../../../../shared/native-chat/native-chat-shell-command'
import type { AgentSessionJournal } from '../../agent-session-journal/journal-store'

// A leading slash invokes the agent's own command, which context in front of it would break.
function carriesShellContext(body: AgentJournalMessageItem): boolean {
  if (body.role !== 'user' || body.command || body.sentAs) {
    return false
  }
  const first = body.blocks.find((block) => block.type === 'text')
  return !(first?.type === 'text' && first.text.startsWith('/'))
}

/** The provider input for a message: `!cmd` rows since the last message that carried them go first.
 *  Only the dispatch sees them; the journaled message stays what the person typed. */
export function withShellCommandContext(
  journal: Pick<AgentSessionJournal, 'visitItems' | 'canonicalItemId'>,
  clientMessageId: string,
  body: AgentJournalMessageItem
): AgentJournalMessageItem {
  if (!carriesShellContext(body)) {
    return body
  }
  const own = journal.canonicalItemId(agentJournalSubmissionKey(clientMessageId))
  let carriedUpTo = -1
  const rows: { sequence: number; text: string }[] = []
  journal.visitItems((itemId, sequence, item) => {
    if (item.kind === 'status' && isNativeChatShellCommandItemId(itemId)) {
      rows.push({ sequence, text: item.text })
    } else if (
      item.kind === 'message' &&
      itemId !== own &&
      journal.canonicalItemId(itemId) !== own &&
      carriesShellContext(item)
    ) {
      carriedUpTo = Math.max(carriedUpTo, sequence)
    }
  })
  const pending = rows
    .filter((row) => row.sequence > carriedUpTo)
    .sort((a, b) => a.sequence - b.sequence)
    .map((row) => row.text)
  if (pending.length === 0) {
    return body
  }
  return {
    ...body,
    blocks: [{ type: 'text', text: nativeChatShellCommandAgentContext(pending) }, ...body.blocks]
  }
}
