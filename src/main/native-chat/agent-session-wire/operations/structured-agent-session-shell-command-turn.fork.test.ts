import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../runtime/agent-session/environment/structured-agent-shell-environment', () => ({
  hostShellEnvironment: async () => ({})
}))

import {
  runStructuredAgentSessionShellCommand,
  type StructuredShellCommandDeps
} from './structured-agent-session-shell-command'

function harness(startsTurn: boolean) {
  const send = vi.fn(async () => ({ ok: true as const }))
  const appendItem = vi.fn(async () => undefined)
  const host = {
    deps: {
      store: {
        getRecord: () => ({ launchDirectory: '/repo', lease: { runtimeFence: 7 } }),
        getConversation: () => ({ currentFence: 3 })
      },
      logger: { warn: vi.fn() }
    },
    conversation: async () => ({
      journal: {
        appendItem,
        reads: { newestTurn: async () => null, pendingSubmissions: async () => [] }
      }
    }),
    send
  } as unknown as StructuredShellCommandDeps['host']
  const run = vi.fn(async () => ({
    stdout: 'clean\n',
    stderr: '',
    code: 0,
    signal: null,
    timedOut: false
  }))
  const deps = { host, startsTurn, run } as unknown as StructuredShellCommandDeps
  return { deps, send, appendItem }
}

describe('a !cmd turn', () => {
  it('sends the typed command once its output row is recorded', async () => {
    const { deps, send, appendItem } = harness(true)
    await expect(runStructuredAgentSessionShellCommand(deps, 's1', 'git status')).resolves.toEqual({
      ok: true
    })
    expect(appendItem).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(1)
    const [, params] = send.mock.calls[0] as unknown as [
      unknown,
      {
        envelope: { sessionId: string; expectedRuntimeFence: number }
        body: unknown
        personsMessage?: boolean
      }
    ]
    expect(params.envelope.sessionId).toBe('s1')
    expect(params.envelope.expectedRuntimeFence).toBe(7)
    expect(params.body).toEqual({
      kind: 'message',
      role: 'user',
      blocks: [{ type: 'text', text: '!git status' }]
    })
    expect(params.personsMessage).toBe(true)
    expect(appendItem.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0])
  })

  it('leaves the output for the next message when the setting is off', async () => {
    const { deps, send, appendItem } = harness(false)
    await runStructuredAgentSessionShellCommand(deps, 's1', 'git status')
    expect(appendItem).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
  })
})
