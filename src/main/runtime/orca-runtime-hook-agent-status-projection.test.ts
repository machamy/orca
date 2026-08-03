// #11761: on a headless `orca serve` host the HTTP agent hook is the only carrier of
// live agent state, so `session.tabs` must project the hook row's status fields — not
// just its identity — while still refusing rows that only prove an agent once existed.
import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'
import { AGENT_STATUS_STALE_AFTER_MS } from '../../shared/agent-status-types'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import { makePaneKey } from '../../shared/stable-pane-id'

vi.mock('electron', () => ({
  BrowserWindow: { fromId: vi.fn(() => null) },
  webContents: { fromId: vi.fn(() => null) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp') }
}))

const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const TAB_ID = 'ask-tab'
const WORKTREE_ID = 'wt-1'
const PANE_KEY = makePaneKey(TAB_ID, LEAF_ID)
const PTY_ID = 'pty-ask'
const ASK_PROMPT = JSON.stringify({
  questions: [
    {
      question: 'Tabs or spaces?',
      header: 'Style',
      multiSelect: false,
      options: [{ label: 'Tabs' }, { label: 'Spaces' }]
    }
  ]
})
const PROVIDER_SESSION = {
  key: 'session_id' as const,
  id: 'ac1f6b90-2f77-4f0e-9c5e-1d2f6a4b8c31',
  transcriptPath: '/transcripts/ac1f6b90.jsonl'
}

function hookRow(overrides: Partial<AgentStatusIpcPayload> = {}): AgentStatusIpcPayload {
  const now = Date.now()
  return {
    paneKey: PANE_KEY,
    state: 'waiting',
    prompt: 'Tabs or spaces?',
    agentType: 'claude',
    toolName: 'AskUserQuestion',
    interactivePrompt: ASK_PROMPT,
    connectionId: null,
    receivedAt: now,
    stateStartedAt: now,
    tabId: TAB_ID,
    worktreeId: WORKTREE_ID,
    providerSession: PROVIDER_SESSION,
    ...overrides
  }
}

async function createRuntimeWithHookRows(
  rows: AgentStatusIpcPayload[]
): Promise<OrcaRuntimeService> {
  const runtime = new OrcaRuntimeService(null, undefined, {
    getAgentStatusSnapshot: () => rows
  })
  const internals = runtime as unknown as {
    resolveTerminalWorkspaceLaunchScope: (selector: string) => Promise<unknown>
  }
  vi.spyOn(internals, 'resolveTerminalWorkspaceLaunchScope').mockResolvedValue({
    id: WORKTREE_ID,
    path: '/repo/app',
    connectionId: null,
    repo: null,
    folderWorkspace: null
  })
  runtime.setPtyController({
    spawn: vi.fn().mockResolvedValue({ id: PTY_ID }),
    write: () => true,
    kill: () => true,
    getForegroundProcess: async () => null
  })
  await runtime.createTerminal(`id:${WORKTREE_ID}`, {
    tabId: TAB_ID,
    leafId: LEAF_ID,
    launchAgent: 'claude',
    title: 'Terminal'
  })
  return runtime
}

async function projectAgentStatus(
  rows: AgentStatusIpcPayload[],
  preparePane?: (runtime: OrcaRuntimeService) => void
): Promise<Record<string, unknown> | undefined> {
  const runtime = await createRuntimeWithHookRows(rows)
  preparePane?.(runtime)
  const result = await runtime.listMobileSessionTabs(`id:${WORKTREE_ID}`)
  const tab = result.tabs[0]
  return tab?.type === 'terminal'
    ? (tab.agentStatus as unknown as Record<string, unknown> | undefined)
    : undefined
}

function ptyRecord(runtime: OrcaRuntimeService): {
  title: string | null
  titleUpdatedAt: number | null
  lastOscTitle: string | null
  lastOscTitleAt: number | null
  lastAgentStatus: string | null
} {
  return (
    runtime as unknown as {
      ptysById: Map<
        string,
        {
          title: string | null
          titleUpdatedAt: number | null
          lastOscTitle: string | null
          lastOscTitleAt: number | null
          lastAgentStatus: string | null
        }
      >
    }
  ).ptysById.get(PTY_ID)!
}

describe('headless hook agent-status projection (#11761)', () => {
  it('carries the hook state, tool and interactivePrompt to paired clients', async () => {
    const agentStatus = await projectAgentStatus([hookRow()])

    expect(agentStatus).toEqual(
      expect.objectContaining({
        agentType: 'claude',
        state: 'waiting',
        prompt: 'Tabs or spaces?',
        toolName: 'AskUserQuestion',
        interactivePrompt: ASK_PROMPT,
        providerSession: PROVIDER_SESSION
      })
    )
  })

  it('publishes no hook transport identity to clients', async () => {
    const agentStatus = await projectAgentStatus([
      hookRow({ launchToken: 'lt-secret', promptInteractionKey: 'turn-1' })
    ])

    expect(Object.keys(agentStatus ?? {}).sort()).toEqual([
      'agentType',
      'interactivePrompt',
      'paneKey',
      'prompt',
      'providerSession',
      'state',
      'stateHistory',
      'stateStartedAt',
      'tabId',
      'terminalHandle',
      'terminalTitle',
      'toolName',
      'updatedAt',
      'worktreeId'
    ])
  })

  it('falls back to identity-only done once the hook row goes stale', async () => {
    const stale = Date.now() - AGENT_STATUS_STALE_AFTER_MS - 1_000
    const agentStatus = await projectAgentStatus([
      hookRow({ receivedAt: stale, stateStartedAt: stale })
    ])

    expect(agentStatus).toEqual(
      expect.objectContaining({ state: 'done', prompt: '', providerSession: PROVIDER_SESSION })
    )
    expect(agentStatus).not.toHaveProperty('interactivePrompt')
  })

  it('never fabricates live state from a resume-identity row', async () => {
    const agentStatus = await projectAgentStatus([hookRow({ providerSessionOnly: true })])

    expect(agentStatus).toEqual(expect.objectContaining({ state: 'done', prompt: '' }))
    expect(agentStatus).not.toHaveProperty('toolName')
  })

  // Pi reports resume identity through a row whose status fields are transport
  // placeholders, and `agentType` deliberately admits it — `live` must not.
  it('never fabricates live state from a pi resume-identity row', async () => {
    const agentStatus = await projectAgentStatus([
      hookRow({ agentType: 'pi', providerSessionOnly: true })
    ])

    expect(agentStatus).toEqual(expect.objectContaining({ state: 'done', prompt: '' }))
    expect(agentStatus).not.toHaveProperty('interactivePrompt')
  })

  // #7970: a retained OSC 9999 row is the pane's own report and keeps precedence.
  it('prefers a retained OSC 9999 row over the hook row', async () => {
    const runtime = await createRuntimeWithHookRows([hookRow()])
    runtime.onPtyData(
      PTY_ID,
      '\x1b]9999;{"state":"working","prompt":"fix the tests","agentType":"claude"}\x07',
      100
    )

    const result = await runtime.listMobileSessionTabs(`id:${WORKTREE_ID}`)
    const tab = result.tabs[0]

    expect(tab?.type === 'terminal' && tab.agentStatus).toEqual(
      expect.objectContaining({ state: 'working', prompt: 'fix the tests' })
    )
  })

  // #1437: `toolName` is inherited across hook events, so it cannot reopen a pane
  // the shell has reclaimed — only a pending question may survive the suppression.
  it('keeps a shell-reclaimed pane identity-only when the hook row has just a toolName', async () => {
    const agentStatus = await projectAgentStatus(
      [hookRow({ state: 'working', toolName: 'Bash', interactivePrompt: undefined })],
      (runtime) => {
        const pty = ptyRecord(runtime)
        pty.title = 'bash'
        pty.lastOscTitle = 'bash'
        pty.titleUpdatedAt = Date.now()
        pty.lastOscTitleAt = Date.now()
      }
    )

    expect(agentStatus).toEqual(expect.objectContaining({ state: 'done', prompt: '' }))
    expect(agentStatus).not.toHaveProperty('toolName')
  })

  it('keeps a pending question visible even under a non-agent title', async () => {
    const agentStatus = await projectAgentStatus([hookRow()], (runtime) => {
      const pty = ptyRecord(runtime)
      pty.title = 'bash'
      pty.lastOscTitle = 'bash'
      pty.titleUpdatedAt = Date.now()
      pty.lastOscTitleAt = Date.now()
    })

    expect(agentStatus).toEqual(
      expect.objectContaining({ state: 'waiting', interactivePrompt: ASK_PROMPT })
    )
  })

  // The title path is refreshed live; an older hook `done` must not erase it.
  it('keeps the title-derived working state when the hook row predates the title', async () => {
    const now = Date.now()
    const agentStatus = await projectAgentStatus(
      [
        hookRow({
          state: 'done',
          prompt: '',
          toolName: undefined,
          interactivePrompt: undefined,
          receivedAt: now - 60_000,
          stateStartedAt: now - 60_000
        })
      ],
      (runtime) => {
        const pty = ptyRecord(runtime)
        pty.title = '⠋ Claude'
        pty.lastOscTitle = '⠋ Claude'
        pty.titleUpdatedAt = now
        pty.lastOscTitleAt = now
        pty.lastAgentStatus = 'working'
      }
    )

    expect(agentStatus).toEqual(expect.objectContaining({ state: 'working', prompt: '' }))
  })
})

// Nothing else republishes `session.tabs` when only a hook row changed, and a
// re-emit at an unchanged `snapshotVersion` is dropped by the client's gate.
describe('hook-driven session tabs republish (#11761)', () => {
  it('bumps the snapshot version and emits through the coalescer', async () => {
    const rows = [hookRow({ state: 'working', toolName: undefined, interactivePrompt: undefined })]
    const runtime = await createRuntimeWithHookRows(rows)
    const before = await runtime.listMobileSessionTabs(`id:${WORKTREE_ID}`)
    const events: { snapshotVersion: number }[] = []
    const unsubscribe = runtime.onMobileSessionTabsChanged((snapshot) => events.push(snapshot))

    rows[0] = hookRow()
    runtime.touchMobileSessionTabsForPane(PANE_KEY, WORKTREE_ID)

    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]!.snapshotVersion).toBeGreaterThan(before.snapshotVersion)
    unsubscribe()
  })

  it('ignores a pane with no resolvable workspace', async () => {
    const runtime = await createRuntimeWithHookRows([hookRow()])
    const events: unknown[] = []
    const unsubscribe = runtime.onMobileSessionTabsChanged((snapshot) => events.push(snapshot))

    runtime.touchMobileSessionTabsForPane(makePaneKey('gone-tab', LEAF_ID))

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(events).toHaveLength(0)
    unsubscribe()
  })

  // Without this the live state published above would outlive the agent as a
  // question card no client could ever dismiss.
  it('retires the question card after the pane status is cleared', async () => {
    const rows = [hookRow()]
    const runtime = await createRuntimeWithHookRows(rows)
    await runtime.listMobileSessionTabs(`id:${WORKTREE_ID}`)
    const events: { tabs: { type: string; agentStatus?: unknown }[] }[] = []
    const unsubscribe = runtime.onMobileSessionTabsChanged((snapshot) => events.push(snapshot))

    // What a pane-status clear leaves behind: the pane keeps no hook row at all.
    rows.length = 0
    runtime.touchMobileSessionTabsForPane(PANE_KEY, WORKTREE_ID)

    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]!.tabs[0]!.agentStatus).toBeUndefined()
    unsubscribe()
  })
})
