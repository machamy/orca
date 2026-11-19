import { describe, expect, it } from 'vitest'
import type {
  AgentJournalItemBody,
  AgentJournalMessageItem
} from '../../../../../shared/agent-session/journal/agent-session-journal-types'
import { agentJournalSubmissionKey } from '../../../../../shared/agent-session/journal/agent-session-journal-item-key'
import { withShellCommandContext } from '../structured-agent-session-shell-context'

type Row = { itemId: string; body: AgentJournalItemBody }

function journalOf(rows: readonly Row[]) {
  return {
    canonicalItemId: (itemId: string) => itemId,
    visitItems: (visit: (itemId: string, sequence: number, body: AgentJournalItemBody) => void) =>
      rows.forEach((row, sequence) => visit(row.itemId, sequence, row.body))
  }
}

const user = (text: string): AgentJournalMessageItem => ({
  kind: 'message',
  role: 'user',
  blocks: [{ type: 'text', text }]
})
const shellRow = (id: string, text: string): Row => ({
  itemId: agentJournalSubmissionKey(`shell-command:${id}`),
  body: { kind: 'status', presentation: 'command-output', text }
})
const message = (id: string, text: string): Row => ({
  itemId: agentJournalSubmissionKey(id),
  body: user(text)
})

function sentText(body: AgentJournalMessageItem): string {
  return body.blocks.map((block) => (block.type === 'text' ? block.text : '')).join('\n')
}

describe('withShellCommandContext', () => {
  it('puts only the rows since the last carrying message ahead of the prompt', () => {
    const journal = journalOf([
      shellRow('a', '$ pwd\n/old'),
      message('m1', 'first'),
      shellRow('b', '$ ls\nREADME.md'),
      shellRow('c', '$ false\n[exit 1]'),
      message('m2', 'what failed?')
    ])
    const sent = withShellCommandContext(journal, 'm2', user('what failed?'))
    const text = sentText(sent)
    expect(text).toContain('$ ls\nREADME.md\n\n$ false\n[exit 1]')
    expect(text).not.toContain('/old')
    expect(text.endsWith('what failed?')).toBe(true)
  })

  it('leaves a slash command alone and lets the next message carry the rows', () => {
    const journal = journalOf([
      shellRow('a', '$ ls\nREADME.md'),
      message('m1', '/review'),
      message('m2', 'now explain')
    ])
    expect(withShellCommandContext(journal, 'm1', user('/review'))).toEqual(user('/review'))
    expect(sentText(withShellCommandContext(journal, 'm2', user('now explain')))).toContain(
      '$ ls\nREADME.md'
    )
  })

  it('sends a message unchanged when no row is waiting', () => {
    const journal = journalOf([shellRow('a', '$ ls'), message('m1', 'one'), message('m2', 'two')])
    expect(withShellCommandContext(journal, 'm2', user('two'))).toEqual(user('two'))
  })
})
