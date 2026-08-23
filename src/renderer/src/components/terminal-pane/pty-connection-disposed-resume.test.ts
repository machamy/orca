import type * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushAsyncTicks, createDeferred } from './pty-connection-test-async'
import {
  leafIdForPane,
  createMockTransport,
  createPane,
  createManager
} from './pty-connection-test-pane-fixtures'
import { buildPaneConnectionDeps } from './pty-connection-test-deps'
import { createInitialStoreState } from './pty-connection-test-store-fixtures'
import type { StoreState } from './pty-connection-test-store-state'
import type { MockTransport } from './pty-connection-test-pane-fixtures'
import {
  installTerminalTestGlobals,
  restoreTerminalTestGlobals
} from './pty-connection-test-environment'

const {
  resetAndRefreshAllTerminalWebglAtlases,
  scheduleTerminalWebglAtlasRecovery,
  scheduleRuntimeGraphSync,
  shouldSeedCacheTimerOnInitialTitle,
  toastInfo,
  notifyCodexPaneBoundForStaleSweep
} = vi.hoisted(() => ({
  resetAndRefreshAllTerminalWebglAtlases: vi.fn(),
  scheduleTerminalWebglAtlasRecovery: vi.fn(),
  scheduleRuntimeGraphSync: vi.fn(),
  shouldSeedCacheTimerOnInitialTitle: vi.fn(() => false),
  toastInfo: vi.fn(),
  notifyCodexPaneBoundForStaleSweep: vi.fn()
}))

let mockStoreState: StoreState
let transportFactoryQueue: MockTransport[] = []
let createdTransportOptions: Record<string, unknown>[] = []
let storeSubscribers: ((state: StoreState) => void)[] = []

vi.mock('@/runtime/sync-runtime-graph', () => ({
  scheduleRuntimeGraphSync
}))

vi.mock('@/lib/pane-manager/pane-manager-registry', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resetAndRefreshAllTerminalWebglAtlases
}))

vi.mock('./terminal-webgl-atlas-recovery', () => ({
  scheduleTerminalWebglAtlasRecovery
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mockStoreState,
    subscribe: (listener: (state: StoreState) => void) => {
      storeSubscribers.push(listener)
      return () => {
        storeSubscribers = storeSubscribers.filter((candidate) => candidate !== listener)
      }
    }
  }
}))

vi.mock('@/lib/agent-status', async (importOriginal) => {
  const { buildAgentStatusModuleMock } = await import('./pty-connection-test-environment')
  return buildAgentStatusModuleMock(await importOriginal<Record<string, unknown>>())
})

vi.mock('./cache-timer-seeding', () => ({
  shouldSeedCacheTimerOnInitialTitle
}))

vi.mock('sonner', () => ({
  toast: {
    info: toastInfo
  }
}))

vi.mock('@/lib/codex-stale-pane-sweep', () => ({
  notifyCodexPaneBoundForStaleSweep
}))

// Why: mirrors the hibernation-wake suite — no test here renders React, so a
// pass-through useCallback keeps the real hooks usable outside a component.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>()
  return {
    ...actual,
    useCallback: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn
  }
})

vi.mock('./pty-transport', () => ({
  createIpcPtyTransport: vi.fn((options: Record<string, unknown>) => {
    createdTransportOptions.push(options)
    const nextTransport = transportFactoryQueue.shift()
    if (!nextTransport) {
      throw new Error('No mock transport queued')
    }
    return nextTransport
  })
}))

vi.mock('./remote-runtime-pty-transport', () => ({
  createRemoteRuntimePtyTransport: vi.fn(
    (_environmentId: string, options: Record<string, unknown>) => {
      createdTransportOptions.push(options)
      const nextTransport = transportFactoryQueue.shift()
      if (!nextTransport) {
        throw new Error('No mock transport queued')
      }
      return nextTransport
    }
  )
}))

vi.mock('./pty-dispatcher', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getEagerPtyBufferHandle: vi.fn(() => undefined)
  }
})

function createDeps(overrides: Record<string, unknown> = {}) {
  return buildPaneConnectionDeps(() => mockStoreState, overrides)
}

type WakeBinding = {
  wakeHibernatedAgentIfArmed: (claimedProviderSessions?: Set<string>) => string | null
  dispose: () => void
}

function seedSleepingRecord(paneKey: string, sessionId: string): void {
  mockStoreState.sleepingAgentSessionsByPaneKey[paneKey] = {
    paneKey,
    tabId: 'tab-1',
    worktreeId: 'wt-1',
    agent: 'claude',
    providerSession: { key: 'session_id', id: sessionId },
    prompt: 'test prompt',
    state: 'done',
    capturedAt: 1,
    updatedAt: 1,
    origin: 'worktree-sleep'
  }
}

// Arms the hibernation wake exactly like the wake suite: connect, then let the
// suppressed kill's exit land while the pane stays hidden.
async function connectAndArm(paneId: number): Promise<{
  binding: WakeBinding
  transport: MockTransport
  exitOptionsIndex: number
}> {
  const { connectPanePty } = await import('./pty-connection')
  const transport = createMockTransport(`pty-pane-${paneId}`)
  transportFactoryQueue.push(transport)
  const manager = createManager(1)
  const deps = createDeps({
    consumeSuppressedPtyExit: vi.fn(() => true),
    isVisibleRef: { current: false }
  })
  const pane = createPane(paneId)
  const binding = connectPanePty(
    pane as never,
    manager as never,
    deps as never
  ) as unknown as WakeBinding
  await flushAsyncTicks()
  const exitOptionsIndex = createdTransportOptions.length - 1
  const onPtyExit = createdTransportOptions[exitOptionsIndex]?.onPtyExit as
    | ((ptyId: string) => void)
    | undefined
  expect(onPtyExit).toBeTypeOf('function')
  onPtyExit?.('tab-pty')
  await flushAsyncTicks()
  return { binding, transport, exitOptionsIndex }
}

describe('cold-restore resume settlement', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    transportFactoryQueue = []
    createdTransportOptions = []
    storeSubscribers = []
    mockStoreState = createInitialStoreState(() => mockStoreState)
    installTerminalTestGlobals()
  })

  afterEach(async () => {
    await restoreTerminalTestGlobals()
  })

  it('skips the resume bookkeeping when the pane is disposed while the spawn is pending', async () => {
    const paneKey = `tab-1:${leafIdForPane(2)}`
    seedSleepingRecord(paneKey, 'sess-disposed')
    mockStoreState.suppressedPtyExitIds['tab-pty'] = true
    const { binding, transport } = await connectAndArm(2)

    const spawnSettled = createDeferred<{ id: string }>()
    transport.connect.mockImplementation(() => spawnSettled.promise)
    const connectCallsBeforeWake = transport.connect.mock.calls.length
    binding.wakeHibernatedAgentIfArmed()
    await flushAsyncTicks()
    // The wake must actually reach the deferred spawn — otherwise the
    // 0-increment verdict below would pass vacuously.
    expect(transport.connect.mock.calls.length).toBeGreaterThan(connectCallsBeforeWake)

    // The pre-spawn startup application may legitimately seed status rows, so
    // the verdict is the increment measured from here.
    mockStoreState.recordAgentProviderSession.mockClear()
    mockStoreState.setAgentStatus.mockClear()

    binding.dispose()
    spawnSettled.resolve({ id: 'pty-resumed' })
    await flushAsyncTicks()

    expect(mockStoreState.recordAgentProviderSession).not.toHaveBeenCalled()
    expect(mockStoreState.setAgentStatus).not.toHaveBeenCalled()
  })

  it('skips the resume bookkeeping when the spawn settles without a PTY', async () => {
    const paneKey = `tab-1:${leafIdForPane(2)}`
    seedSleepingRecord(paneKey, 'sess-null-settle')
    mockStoreState.suppressedPtyExitIds['tab-pty'] = true
    const { binding, transport } = await connectAndArm(2)

    const spawnSettled = createDeferred<null>()
    transport.connect.mockImplementation(() => spawnSettled.promise)
    const connectCallsBeforeWake = transport.connect.mock.calls.length
    binding.wakeHibernatedAgentIfArmed()
    await flushAsyncTicks()
    expect(transport.connect.mock.calls.length).toBeGreaterThan(connectCallsBeforeWake)

    mockStoreState.recordAgentProviderSession.mockClear()
    mockStoreState.setAgentStatus.mockClear()

    // A dead transport reports no PTY, so the tracked spawn resolves null.
    transport.getPtyId.mockReturnValue(null)
    spawnSettled.resolve(null)
    await flushAsyncTicks()

    expect(mockStoreState.recordAgentProviderSession).not.toHaveBeenCalled()
    expect(mockStoreState.setAgentStatus).not.toHaveBeenCalled()
  })

  it('falls back to a plain spawn and clears only the matching record when the claim is lost', async () => {
    const loserPaneKey = `tab-1:${leafIdForPane(1)}`
    const winnerPaneKey = `tab-1:${leafIdForPane(2)}`
    seedSleepingRecord(loserPaneKey, 'sess-raced')
    seedSleepingRecord(winnerPaneKey, 'sess-raced')
    mockStoreState.suppressedPtyExitIds['tab-pty'] = true

    const loser = await connectAndArm(1)
    const winner = await connectAndArm(2)

    // Winner takes the resume claim and holds it: its spawn never settles
    // inside this test window, so the loser wakes mid-claim.
    const winnerSpawn = createDeferred<{ id: string }>()
    winner.transport.connect.mockImplementation(() => winnerSpawn.promise)
    winner.binding.wakeHibernatedAgentIfArmed()
    await flushAsyncTicks()
    const winnerConnect = winner.transport.connect.mock.calls.at(-1)?.[0] as
      | { command?: string }
      | undefined
    expect(winnerConnect?.command).toContain('--resume')
    expect(winnerConnect?.command).toContain('sess-raced')

    const loserConnectCallsBeforeWake = loser.transport.connect.mock.calls.length
    loser.binding.wakeHibernatedAgentIfArmed()
    await flushAsyncTicks()

    // The loser must not double-launch the session: its replacement shell
    // spawns with no startup command at all.
    const loserConnect = loser.transport.connect.mock.calls.at(-1)?.[0] as
      | { command?: string }
      | undefined
    expect(loser.transport.connect.mock.calls.length).toBeGreaterThan(loserConnectCallsBeforeWake)
    expect(loserConnect?.command).toBeUndefined()

    // Only the loser's own record (naming the exact claimed session) is
    // cleared — the winner's record survives until its spawn settles.
    expect(mockStoreState.clearSleepingAgentSession.mock.calls).toEqual([[loserPaneKey]])
    expect(mockStoreState.sleepingAgentSessionsByPaneKey[winnerPaneKey]).toBeDefined()

    winnerSpawn.resolve({ id: 'pty-winner' })
    await flushAsyncTicks()
  })
})
