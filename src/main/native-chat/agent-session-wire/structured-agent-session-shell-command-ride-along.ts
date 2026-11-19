// `!cmd` rows the person ran ride ahead of their next words, once, as automation results do.

import {
  AGENT_JOURNAL_THREAD_SCOPE,
  type AgentJournalMessageItem,
  type AgentJournalSubmission
} from '../../../shared/agent-session/journal/agent-session-journal-types'
import type { AgentJournalTurnScope } from '../../../shared/agent-session/journal/agent-session-journal-turn-scope'
import { refusedBeforeWrite } from '../../../shared/agent-session/lifecycle/stopping/agent-session-stopped-history'
import {
  nativeChatShellCommandAgentContext,
  nativeChatShellCommandBody,
  nativeChatShellCommandClientMessageId,
  nativeChatShellCommandOf,
  type NativeChatShellCommandRun
} from '../../../shared/native-chat/native-chat-shell-command'
import type { AgentSessionJournal } from '../agent-session-journal/journal-store'
import { sendCarriesRideAlong } from './structured-agent-session-automation-results'

type ShellCommandJournal = Pick<AgentSessionJournal, 'appendItem'> & {
  reads: Pick<AgentSessionJournal['reads'], 'shellCommandRows'>
}

/** Unread runs, those a refused send claimed, and those this send claimed (a fresh retry re-carries them). */
export async function carriedShellCommands(
  journal: ShellCommandJournal,
  turnScope: AgentJournalTurnScope,
  submission: AgentJournalSubmission,
  body: AgentJournalMessageItem
): Promise<NativeChatShellCommandRun[]> {
  if (!sendCarriesRideAlong(turnScope, submission, body)) {
    return []
  }
  const { items, submissions } = await journal.reads.shellCommandRows()
  const refused = (carrierId: string) => {
    const carrier = submissions.find((send) => send.clientMessageId === carrierId)
    return carrier !== undefined && refusedBeforeWrite(carrier)
  }
  return items.flatMap(({ body: item }) => {
    const run = nativeChatShellCommandOf(item)
    return run &&
      (run.readWith === undefined ||
        run.readWith === submission.clientMessageId ||
        refused(run.readWith))
      ? [run]
      : []
  })
}

export async function markShellCommandsRead(
  journal: ShellCommandJournal,
  runs: readonly NativeChatShellCommandRun[],
  clientMessageId: string,
  fence: number
): Promise<void> {
  for (const run of runs) {
    if (run.readWith === clientMessageId) {
      continue
    }
    await journal.appendItem(
      { provider: 'orca', clientMessageId: nativeChatShellCommandClientMessageId(run.runId) },
      nativeChatShellCommandBody({ ...run, readWith: clientMessageId }),
      { fence, turnScope: AGENT_JOURNAL_THREAD_SCOPE }
    )
  }
}

export function shellCommandsRideAlong(runs: readonly NativeChatShellCommandRun[]): string[] {
  return runs.length === 0 ? [] : [nativeChatShellCommandAgentContext(runs.map((run) => run.text))]
}
