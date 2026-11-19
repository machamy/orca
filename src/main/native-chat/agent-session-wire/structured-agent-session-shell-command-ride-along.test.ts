import { afterEach, describe, expect, it } from 'vitest'
import type { AgentJournalMessageItem } from '../../../shared/agent-session/journal/agent-session-journal-types'
import {
  nativeChatShellCommandBody,
  nativeChatShellCommandClientMessageId
} from '../../../shared/native-chat/native-chat-shell-command'
import {
  createQueuedMessageTestRig,
  type QueuedMessageTestRig
} from './host/testing/structured-agent-session-queued-message-rig.test-fixture'
import { eventually } from './host/testing/structured-agent-session-queued-message-rig-provider.test-fixture'
import { HOST_TEST_SESSION as SESSION } from './host/testing/structured-agent-session-host-test-data.test-fixture'
import { writeStructuredAgentSessionOrcaNote } from './structured-agent-session-orca-note'

let rig: QueuedMessageTestRig

afterEach(async () => {
  await rig.dispose()
})

function text(body: AgentJournalMessageItem): string {
  return body.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n')
}

function dispatched(): string[] {
  return rig.dispatch.mock.calls.map(([input]) => text(input.body))
}

async function shellRow(runId: string, rowText: string): Promise<void> {
  await writeStructuredAgentSessionOrcaNote(
    rig.host,
    SESSION,
    nativeChatShellCommandClientMessageId(runId),
    nativeChatShellCommandBody({ runId, text: rowText })
  )
}

async function nextSend(body: string): Promise<string> {
  const before = rig.dispatch.mock.calls.length
  const { id, result } = rig.send(body)
  expect(await result).toMatchObject({ ok: true })
  if (rig.host.collaboratorsForTests().sessions.get(SESSION)?.child?.phase !== 'ready') {
    await rig.proveStart()
  }
  await eventually(() => expect(rig.dispatch.mock.calls.length).toBe(before + 1))
  return id
}

describe('`!cmd` rows ride with the next message, once', () => {
  it('carries the runs ahead of the words in order, and never again', async () => {
    rig = await createQueuedMessageTestRig()
    await shellRow('run-1', '$ pwd\n/repo')
    await shellRow('run-2', '$ false\n[exit 1]')
    const carrier = await nextSend('what failed?')
    await rig.settleAccepted(carrier, 'ok')
    await nextSend('after')

    const [first, second] = dispatched()
    expect(first).toMatch(/^<orca-shell-commands>/)
    expect(first.indexOf('$ pwd\n/repo')).toBeLessThan(first.indexOf('$ false\n[exit 1]'))
    expect(first.endsWith('</orca-shell-commands>\n\nwhat failed?')).toBe(true)
    expect(second).toBe('after')
  })

  it('carries only runs since the last carrier', async () => {
    rig = await createQueuedMessageTestRig()
    await shellRow('run-1', '$ echo old')
    const carrier = await nextSend('one')
    await rig.settleAccepted(carrier, 'ok')
    await shellRow('run-2', '$ echo new')
    await nextSend('two')

    const second = dispatched()[1]
    expect(second).toContain('$ echo new')
    expect(second).not.toContain('$ echo old')
  })
})
