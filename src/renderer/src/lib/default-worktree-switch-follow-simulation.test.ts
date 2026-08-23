// @vitest-environment happy-dom

/**
 * EMPIRICAL SIMULATION of the mode-B ("agents follow their branch") default-
 * worktree-switch renderer sequence, run headlessly against the REAL zustand
 * store. Reproduces, in order:
 *   1. post-sleep state (runSleepWorktrees / shutdownWorktreeTerminals
 *      keepIdentifiers:true): tab rows kept with row ptyId, live ptyIdsByTabId
 *      cleared, layouts kept, sleeping records captured (origin 'worktree-sleep',
 *      updatedAt = capturedAt), activeWorktreeId null;
 *   2. the exact 3-step identity migrations main sends
 *      (sel -> temp, repo -> sel, temp -> repo), applied through the real
 *      useAppStore.getState().migrateWorktreeIdentity (buildWorktreeRenameState);
 *   3. the useIpcEvents follow-wake tail: setActiveWorktree(promoted default)
 *      then wakeSleepingAgentsForWorktreeInBackground for both ids, with
 *      requestBackgroundTerminalWorktreeMount mocked and window wake-event
 *      listener spies (no mounted panes exist at this point in the real app
 *      either, so nothing claims the in-place wake).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import { makePaneKey } from '../../../shared/stable-pane-id'
import {
  WAKE_HIBERNATED_AGENTS_WORKTREE_EVENT,
  type WakeHibernatedAgentsWorktreeDetail
} from '@/constants/terminal'

const mountRequests = vi.hoisted(() => [] as { worktreeId: string; tabIds?: readonly string[] }[])
vi.mock('@/components/terminal/background-terminal-worktree-mount', () => ({
  requestBackgroundTerminalWorktreeMount: (detail: {
    worktreeId: string
    tabIds?: readonly string[]
  }) => {
    mountRequests.push({
      worktreeId: detail.worktreeId,
      ...(detail.tabIds ? { tabIds: [...detail.tabIds] } : {})
    })
  }
}))

const toastCalls = vi.hoisted(() => [] as { kind: string; message: unknown }[])
vi.mock('sonner', () => ({
  toast: {
    info: (message: unknown) => toastCalls.push({ kind: 'info', message }),
    success: (message: unknown) => toastCalls.push({ kind: 'success', message }),
    error: (message: unknown) => toastCalls.push({ kind: 'error', message }),
    warning: (message: unknown) => toastCalls.push({ kind: 'warning', message }),
    message: (message: unknown) => toastCalls.push({ kind: 'message', message }),
    dismiss: () => {},
    loading: () => {}
  }
}))

import { useAppStore } from '@/store'
import { wakeSleepingAgentsForWorktreeInBackground } from './wake-sleeping-agents-in-background'
import { recordPaneIsOwnedByPreservedPane } from './sleeping-agent-pane-ownership'

const initialAppStoreState = useAppStore.getState()

const REPO_ID = 'r'
const DEFAULT_ID = 'r::/repo'
const SEL_ID = 'r::/sel'
// Mirrors buildContentSwapMigrations: join(dirname('/repo'), `.orca-default-switch-${uuid}`)
const TEMP_ID = 'r::/.orca-default-switch-simulated'
const LEAF_REPO = '11111111-1111-4111-8111-111111111111'
const LEAF_SEL = '22222222-2222-4222-8222-222222222222'
const TAB_REPO = 'tab-repo'
const TAB_SEL = 'tab-sel'
const PANE_KEY_REPO = makePaneKey(TAB_REPO, LEAF_REPO)
const PANE_KEY_SEL = makePaneKey(TAB_SEL, LEAF_SEL)
// Real minted daemon PTY id format: `${worktreeId}@@${suffix}`
// (shared/pty-session-id-format.ts:14-41). keepIdentifiers preserves these.
const PTY_REPO = `${DEFAULT_ID}@@pty-repo`
const PTY_SEL = `${SEL_ID}@@pty-sel`

afterEach(() => {
  mountRequests.length = 0
  toastCalls.length = 0
  useAppStore.setState(initialAppStoreState, true)
})

function makeWorktree(id: string, path: string): Record<string, unknown> {
  return {
    id,
    repoId: REPO_ID,
    displayName: path,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    path,
    head: 'abc',
    branch: path === '/repo' ? 'main' : 'feature',
    isBare: false,
    isMainWorktree: path === '/repo'
  }
}

function makeTerminalTab(
  id: string,
  worktreeId: string,
  deadPtyId: string
): Record<string, unknown> {
  // Post-sleep row: keepIdentifiers preserves tab.ptyId (terminals.ts:3262 keeps
  // s.tabsByWorktree untouched), so the row still carries the dead PTY id.
  return {
    id,
    ptyId: deadPtyId,
    worktreeId,
    title: 'claude',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1,
    launchAgent: 'claude'
  }
}

function makeUnifiedTab(id: string, worktreeId: string): Record<string, unknown> {
  return {
    id,
    entityId: id,
    groupId: `group-${worktreeId}`,
    worktreeId,
    contentType: 'terminal',
    label: 'claude',
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

function makeLayout(leafId: string, ptyId: string): Record<string, unknown> {
  // keepIdentifiers preserves ptyIdsByLeafId (terminals.ts:3348 only clears it
  // for remove-worktree).
  return {
    root: { type: 'leaf', leafId },
    activeLeafId: leafId,
    expandedLeafId: null,
    ptyIdsByLeafId: { [leafId]: ptyId }
  }
}

function makeSleepingRecord(
  overrides: Partial<SleepingAgentSessionRecord>
): SleepingAgentSessionRecord {
  const capturedAt = Date.now()
  return {
    paneKey: PANE_KEY_REPO,
    tabId: TAB_REPO,
    worktreeId: DEFAULT_ID,
    agent: 'claude',
    providerSession: { key: 'session_id', id: 'sess-repo' },
    prompt: 'work',
    state: 'working',
    capturedAt,
    updatedAt: capturedAt, // manualSleepCaptureEntry stamps updatedAt = capturedAt
    origin: 'worktree-sleep',
    ...overrides
  }
}

/** setActiveWorktree fans out into fire-and-forget IPC (github.ts:175 reads
 *  window.api.gh.enqueuePRRefresh, etc.). A deep no-op proxy keeps the real
 *  action running headlessly without enumerating every channel. */
function installWindowApiDeepStub(): void {
  const makeCallableProxy = (): unknown => {
    const fn = (): Promise<undefined> => Promise.resolve(undefined)
    return new Proxy(fn, {
      get: (_target, prop) => {
        if (prop === 'then' || prop === Symbol.toPrimitive) {
          return undefined
        }
        return makeCallableProxy()
      },
      apply: () => Promise.resolve(undefined)
    })
  }
  ;(window as unknown as { api: unknown }).api = makeCallableProxy()
}

type SeedOptions = { agentStates?: { repo: 'working' | 'done'; sel: 'working' | 'done' } }

function seedModeBPostSleepState(options: SeedOptions = {}): {
  recordRepo: SleepingAgentSessionRecord
  recordSel: SleepingAgentSessionRecord
} {
  installWindowApiDeepStub()
  const repoState = options.agentStates?.repo ?? 'working'
  const selState = options.agentStates?.sel ?? 'working'
  const recordRepo = makeSleepingRecord({
    paneKey: PANE_KEY_REPO,
    tabId: TAB_REPO,
    worktreeId: DEFAULT_ID,
    providerSession: { key: 'session_id', id: 'sess-repo' },
    state: repoState,
    // markManualSleepLazyRestore (agent-status.ts:591) sets this on done panes
    ...(repoState === 'done' ? { restoreOnTabOpenOnly: true } : {})
  })
  const recordSel = makeSleepingRecord({
    paneKey: PANE_KEY_SEL,
    tabId: TAB_SEL,
    worktreeId: SEL_ID,
    providerSession: { key: 'session_id', id: 'sess-sel' },
    state: selState,
    ...(selState === 'done' ? { restoreOnTabOpenOnly: true } : {})
  })
  useAppStore.setState({
    repos: [{ id: REPO_ID, path: '/repo', displayName: 'repo', badgeColor: '#888', addedAt: 1 }],
    worktreesByRepo: {
      [REPO_ID]: [makeWorktree(DEFAULT_ID, '/repo'), makeWorktree(SEL_ID, '/sel')]
    },
    tabsByWorktree: {
      [DEFAULT_ID]: [makeTerminalTab(TAB_REPO, DEFAULT_ID, PTY_REPO)],
      [SEL_ID]: [makeTerminalTab(TAB_SEL, SEL_ID, PTY_SEL)]
    },
    unifiedTabsByWorktree: {
      [DEFAULT_ID]: [makeUnifiedTab(TAB_REPO, DEFAULT_ID)],
      [SEL_ID]: [makeUnifiedTab(TAB_SEL, SEL_ID)]
    },
    terminalLayoutsByTabId: {
      [TAB_REPO]: makeLayout(LEAF_REPO, PTY_REPO),
      [TAB_SEL]: makeLayout(LEAF_SEL, PTY_SEL)
    },
    // shutdownWorktreeTerminals clears the LIVE pty list (terminals.ts:3270-3273)
    ptyIdsByTabId: { [TAB_REPO]: [], [TAB_SEL]: [] },
    sleepingAgentSessionsByPaneKey: {
      [PANE_KEY_REPO]: recordRepo,
      [PANE_KEY_SEL]: recordSel
    },
    everActivatedWorktreeIds: new Set([DEFAULT_ID, SEL_ID]),
    // runSleepWorktrees sets the active worktree to null before teardown
    activeWorktreeId: null,
    activeWorkspaceKey: null
  } as never)
  return { recordRepo, recordSel }
}

/** The exact 3-step swap main emits (orca-runtime-default-worktree.ts:60-64),
 *  applied through the real store action (worktrees.ts:5954). */
function applyFollowMigrations(): void {
  const migrate = useAppStore.getState().migrateWorktreeIdentity
  migrate(SEL_ID, TEMP_ID)
  migrate(DEFAULT_ID, SEL_ID)
  migrate(TEMP_ID, DEFAULT_ID)
}

function attachWakeEventSpy(): {
  details: { worktreeId: string; wokenClaimKeysSizeAfterDispatch: number }[]
  detach: () => void
} {
  const details: { worktreeId: string; wokenClaimKeysSizeAfterDispatch: number }[] = []
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<WakeHibernatedAgentsWorktreeDetail>).detail
    // Deliberately does NOT claim anything: at this point in the real sequence
    // both worktrees are slept and un-rendered, so no TerminalPane listener
    // (use-terminal-pane-lifecycle.ts:1812) exists to consume the wake.
    details.push({
      worktreeId: detail.worktreeId,
      wokenClaimKeysSizeAfterDispatch: detail.wokenClaimKeys?.size ?? -1
    })
  }
  window.addEventListener(WAKE_HIBERNATED_AGENTS_WORKTREE_EVENT, listener)
  return {
    details,
    detach: () => window.removeEventListener(WAKE_HIBERNATED_AGENTS_WORKTREE_EVENT, listener)
  }
}

/** Runs the useIpcEvents.ts:859-868 follow-wake tail with the ids the real
 *  flow queues (WorktreeList.tsx:1457 swappedIds = [source, currentDefault],
 *  activate = currentDefault). */
function runFollowWakeTail(): ReturnType<typeof attachWakeEventSpy>['details'] {
  const spy = attachWakeEventSpy()
  useAppStore.getState().setActiveWorktree(DEFAULT_ID)
  for (const worktreeId of [SEL_ID, DEFAULT_ID]) {
    wakeSleepingAgentsForWorktreeInBackground(worktreeId)
  }
  spy.detach()
  return spy.details
}

describe('mode-B follow switch: renderer store simulation', () => {
  it('3-step migration swaps runtime tabs, unified tabs and sleeping records between the two ids', () => {
    seedModeBPostSleepState()
    applyFollowMigrations()

    const s = useAppStore.getState()
    // Selected worktree's session content now lives under the promoted default id.
    expect(s.tabsByWorktree[DEFAULT_ID]?.map((tab) => tab.id)).toEqual([TAB_SEL])
    expect(s.tabsByWorktree[SEL_ID]?.map((tab) => tab.id)).toEqual([TAB_REPO])
    expect(s.tabsByWorktree[TEMP_ID]).toBeUndefined()
    // worktreeId fields rewritten by withNewWorktreeId
    expect(s.tabsByWorktree[DEFAULT_ID]?.[0]?.worktreeId).toBe(DEFAULT_ID)
    expect(s.tabsByWorktree[SEL_ID]?.[0]?.worktreeId).toBe(SEL_ID)
    expect(s.unifiedTabsByWorktree[DEFAULT_ID]?.[0]?.entityId).toBe(TAB_SEL)
    expect(s.unifiedTabsByWorktree[DEFAULT_ID]?.[0]?.worktreeId).toBe(DEFAULT_ID)
    expect(s.unifiedTabsByWorktree[SEL_ID]?.[0]?.entityId).toBe(TAB_REPO)
    // Sleeping records: worktreeId swapped, pane keys untouched.
    expect(s.sleepingAgentSessionsByPaneKey[PANE_KEY_SEL]?.worktreeId).toBe(DEFAULT_ID)
    expect(s.sleepingAgentSessionsByPaneKey[PANE_KEY_REPO]?.worktreeId).toBe(SEL_ID)
    // everActivatedWorktreeIds still contains both stable ids.
    expect(s.everActivatedWorktreeIds.has(DEFAULT_ID)).toBe(true)
    expect(s.everActivatedWorktreeIds.has(SEL_ID)).toBe(true)
    expect(s.everActivatedWorktreeIds.has(TEMP_ID)).toBe(false)
  })

  it('reports which record/tab fields still embed pre-swap identity after migration', () => {
    seedModeBPostSleepState()
    applyFollowMigrations()

    const s = useAppStore.getState()
    const staleFields: string[] = []
    for (const [paneKey, record] of Object.entries(s.sleepingAgentSessionsByPaneKey)) {
      // paneKey embeds tabId:leafId — tab ids are stable across the swap, so
      // this is correct-by-design, not stale.
      if (record.paneKey !== paneKey) {
        staleFields.push(`record ${paneKey}: paneKey field diverged (${record.paneKey})`)
      }
      // providerSession/transcript stays with the record — correct, main swaps
      // the on-disk ~/.claude/projects dirs (swapClaudeProjectTranscripts).
      if (record.launchConfig?.ompResumeFilePath?.includes('/sel')) {
        staleFields.push(`record ${paneKey}: launchConfig.ompResumeFilePath embeds old path`)
      }
    }
    for (const [worktreeId, tabs] of Object.entries(s.tabsByWorktree)) {
      for (const tab of tabs) {
        if (tab.worktreeId !== worktreeId) {
          staleFields.push(`tab ${tab.id}: worktreeId ${tab.worktreeId} != map key ${worktreeId}`)
        }
        // startupCwd is NOT remapped by buildWorktreeRenameState (only
        // recentlyClosedTerminalTabsByWorktree snapshots get cwd remapping,
        // worktrees.ts:2305-2312). Agent tabs normally have no startupCwd, but
        // any tab that carries one would respawn into the pre-swap directory.
        if (tab.startupCwd) {
          staleFields.push(`tab ${tab.id}: startupCwd ${tab.startupCwd} not remapped`)
        }
      }
    }
    // worktreesByRepo rows keep their (path-derived) ids: the real flow refreshes
    // them via fetchWorktrees; the store migration deliberately leaves them.
    console.log('[follow-simulation] stale-identity fields after swap:', staleFields)
    expect(staleFields).toEqual([])
  })

  it('EMPIRICAL: activated (promoted) worktree gets NO launch and NO mount — its resume depends entirely on pane cold-restore', () => {
    seedModeBPostSleepState()
    applyFollowMigrations()

    const wakeDetails = runFollowWakeTail()
    const s = useAppStore.getState()

    // Wake events fired for both ids but nothing could claim them (no panes mounted).
    expect(wakeDetails.map((d) => d.worktreeId)).toEqual([SEL_ID, DEFAULT_ID])

    // Promoted default (r::/repo) now owns tab-sel + its working record. The
    // record is "pane-owned" (preserved layout leaf + restorable leaf pty +
    // active worktree -> recordPaneIsOwnedByPreservedPane true), so
    // resumeSleepingAgentSessionsForWorktree SKIPS it without launching
    // (resume-sleeping-agent-session.ts:212-214) and the wake requests no
    // background mount for it (non-passive records are excluded from step (b)).
    const defaultTabs = s.tabsByWorktree[DEFAULT_ID] ?? []
    const launchedInDefault = defaultTabs.filter((tab) => tab.id !== TAB_SEL)
    const defaultMounts = mountRequests.filter((req) => req.worktreeId === DEFAULT_ID)
    console.log('[follow-simulation] promoted worktree outcome:', {
      launchedTabIds: launchedInDefault.map((tab) => tab.id),
      mountRequests: defaultMounts,
      recordStillSleeping: Boolean(s.sleepingAgentSessionsByPaneKey[PANE_KEY_SEL])
    })
    expect(launchedInDefault).toEqual([])
    expect(defaultMounts).toEqual([])
    // The record survives, parked, waiting for a TerminalPane cold-restore that
    // only happens if React mounts tab-sel under the promoted worktree.
    expect(s.sleepingAgentSessionsByPaneKey[PANE_KEY_SEL]?.worktreeId).toBe(DEFAULT_ID)
  })

  it('EMPIRICAL: demoted (non-active) worktree launches a fresh resume tab and requests a targeted background mount', () => {
    seedModeBPostSleepState()
    applyFollowMigrations()
    runFollowWakeTail()

    const s = useAppStore.getState()
    // r::/sel now owns tab-repo + its record; the worktree is NOT active, so the
    // record is not pane-owned and the generic resume launches a fresh tab.
    const selTabs = s.tabsByWorktree[SEL_ID] ?? []
    const launched = selTabs.filter((tab) => tab.id !== TAB_REPO)
    const selMounts = mountRequests.filter((req) => req.worktreeId === SEL_ID)
    console.log('[follow-simulation] demoted worktree outcome:', {
      launchedTabIds: launched.map((tab) => tab.id),
      pendingStartups: launched.map((tab) => s.pendingStartupByTabId[tab.id]?.command),
      mountRequests: selMounts,
      toasts: toastCalls
    })
    expect(launched).toHaveLength(1)
    const launchedTab = launched[0]!
    expect(launchedTab.launchAgent).toBe('claude')
    // The queued startup resumes the ORIGINAL default worktree's session id.
    expect(s.pendingStartupByTabId[launchedTab.id]?.command).toContain('sess-repo')
    // suppressNavigation launch -> background mount targeted at the new tab.
    expect(selMounts).toEqual([{ worktreeId: SEL_ID, tabIds: [launchedTab.id] }])
    // Old record consumed by the launch.
    expect(s.sleepingAgentSessionsByPaneKey[PANE_KEY_REPO]).toBeUndefined()
    // Original (slept) tab row survives alongside the fresh resume tab.
    expect(selTabs.some((tab) => tab.id === TAB_REPO)).toBe(true)
  })

  it('EMPIRICAL: done agents (restoreOnTabOpenOnly) get neither mount nor launch on either side', () => {
    seedModeBPostSleepState({ agentStates: { repo: 'done', sel: 'done' } })
    applyFollowMigrations()
    runFollowWakeTail()

    const s = useAppStore.getState()
    console.log('[follow-simulation] done-agent outcome:', {
      mountRequests,
      sleepingLeft: Object.keys(s.sleepingAgentSessionsByPaneKey),
      defaultTabs: (s.tabsByWorktree[DEFAULT_ID] ?? []).map((tab) => tab.id),
      selTabs: (s.tabsByWorktree[SEL_ID] ?? []).map((tab) => tab.id)
    })
    // restoreOnTabOpenOnly records are filtered out of the background wake
    // (wake-sleeping-agents-in-background.ts:193-195), and passive records are
    // never launched by the generic resume — the whole wake is a no-op.
    expect(mountRequests).toEqual([])
    // Records survive only where the pane is still "owned"; either way no
    // terminal reappears until the user opens the preserved tab.
    expect((s.tabsByWorktree[DEFAULT_ID] ?? []).every((tab) => tab.id === TAB_SEL)).toBe(true)
  })

  it('ROOT CAUSE: store-side ownership and pane-side pty ownership contradict each other after the swap', () => {
    seedModeBPostSleepState()
    applyFollowMigrations()
    useAppStore.getState().setActiveWorktree(DEFAULT_ID)

    const s = useAppStore.getState()
    const migratedRecord = s.sleepingAgentSessionsByPaneKey[PANE_KEY_SEL]!
    expect(migratedRecord.worktreeId).toBe(DEFAULT_ID)

    // Side 1 — the wake's ownership check (REAL function): the record is
    // "pane-owned", so wakeSleepingAgentsForWorktreeInBackground /
    // resumeSleepingAgentSessionsForWorktree deliberately do NOT launch it
    // (resume-sleeping-agent-session.ts:212-214). Ownership is granted because
    // hasRestorableStablePanePty sees the preserved leaf binding
    // (sleeping-agent-pane-ownership.ts:66-80) and the worktree is active.
    expect(recordPaneIsOwnedByPreservedPane(migratedRecord, s)).toBe(true)

    // Side 2 — the pane mount's ownership check on the SAME data: the preserved
    // leaf binding / tab.ptyId is a minted id that still embeds the PRE-swap
    // worktree id, because buildWorktreeRenameState never rewrites minted PTY
    // session ids. isSessionOwnedByWorktree (pty-connection.ts:897-903, applied
    // at 8600) therefore vetoes the reattach-with-cold-restore path, and the
    // truthy detachedLivePtyId (8538-8545) routes the mount into the bare
    // ATTACH branch (8749-8791) — attach to a dead foreign PTY with NO
    // cold-restore fallback. The agent never resumes; the record stays parked.
    const promotedTab = s.tabsByWorktree[DEFAULT_ID]!.find((tab) => tab.id === TAB_SEL)!
    const leafBinding = (
      s.terminalLayoutsByTabId[TAB_SEL] as unknown as {
        ptyIdsByLeafId: Record<string, string>
      }
    ).ptyIdsByLeafId[LEAF_SEL]!
    const paneSideOwnership = (sessionId: string, worktreeId: string): boolean => {
      const separatorIdx = sessionId.lastIndexOf('@@')
      return separatorIdx === -1 || sessionId.slice(0, separatorIdx) === worktreeId
    }
    console.log('[follow-simulation] ownership contradiction:', {
      storeSaysPaneOwned: recordPaneIsOwnedByPreservedPane(migratedRecord, s),
      tabRowPtyId: promotedTab.ptyId,
      leafBinding,
      paneWouldReattachWithColdRestore: paneSideOwnership(leafBinding, DEFAULT_ID)
    })
    expect(promotedTab.ptyId).toBe(PTY_SEL) // still embeds r::/sel
    expect(leafBinding).toBe(PTY_SEL)
    expect(paneSideOwnership(leafBinding, DEFAULT_ID)).toBe(false)
    // The same stale binding is what GRANTED store-side ownership above:
    // both layers claim "the other one will resume it" -> nobody does.
  })

  it('EMPIRICAL control: without prior activation, BOTH worktrees launch background resume tabs', () => {
    // Shows the resume path itself works when nothing is pane-owned: if
    // setActiveWorktree(promoted) were NOT called first, both sides would take
    // the fresh-tab launch path.
    seedModeBPostSleepState()
    applyFollowMigrations()
    const spy = attachWakeEventSpy()
    for (const worktreeId of [SEL_ID, DEFAULT_ID]) {
      wakeSleepingAgentsForWorktreeInBackground(worktreeId)
    }
    spy.detach()

    const s = useAppStore.getState()
    const launchedDefault = (s.tabsByWorktree[DEFAULT_ID] ?? []).filter((tab) => tab.id !== TAB_SEL)
    const launchedSel = (s.tabsByWorktree[SEL_ID] ?? []).filter((tab) => tab.id !== TAB_REPO)
    console.log('[follow-simulation] no-activation control:', {
      launchedDefault: launchedDefault.map((tab) => tab.id),
      launchedSel: launchedSel.map((tab) => tab.id),
      mountRequests
    })
    expect(launchedDefault).toHaveLength(1)
    expect(launchedSel).toHaveLength(1)
    expect(mountRequests.map((req) => req.worktreeId).sort()).toEqual([DEFAULT_ID, SEL_ID])
  })

  it('FIX: migration remaps expandedDirs and closed-editor snapshot paths into the new home', () => {
    seedModeBPostSleepState()
    useAppStore.setState({
      expandedDirs: {
        [SEL_ID]: new Set(['/sel/src', '/sel/src/components']),
        [DEFAULT_ID]: new Set(['/repo/docs'])
      },
      recentlyClosedEditorTabsByWorktree: {
        [SEL_ID]: [
          {
            filePath: '/sel/src/app.ts',
            relativePath: 'src/app.ts',
            worktreeId: SEL_ID,
            language: 'typescript'
          }
        ]
      }
    } as never)
    applyFollowMigrations()

    const after = useAppStore.getState() as unknown as {
      expandedDirs: Record<string, Set<string>>
      recentlyClosedEditorTabsByWorktree: Record<string, { filePath: string; worktreeId: string }[]>
    }
    // The selected worktree's file-tree expansion followed its branch to /repo.
    expect([...(after.expandedDirs[DEFAULT_ID] ?? [])].sort()).toEqual([
      '/repo/src',
      '/repo/src/components'
    ])
    expect([...(after.expandedDirs[SEL_ID] ?? [])]).toEqual(['/sel/docs'])
    // Reopen-closed-editor-tab must load from the new home, not the old branch.
    expect(after.recentlyClosedEditorTabsByWorktree[DEFAULT_ID]?.[0]?.filePath).toBe(
      '/repo/src/app.ts'
    )
  })

  it('FIX: migration remaps a live tab startupCwd into its new home', () => {
    seedModeBPostSleepState()
    const s = useAppStore.getState()
    useAppStore.setState({
      tabsByWorktree: {
        ...s.tabsByWorktree,
        [SEL_ID]: (s.tabsByWorktree[SEL_ID] ?? []).map((tab) => ({
          ...tab,
          startupCwd: '/sel/packages/app'
        }))
      }
    } as never)
    applyFollowMigrations()

    const after = useAppStore.getState()
    // The selected worktree's tab followed its branch to the repo path; its
    // startupCwd must point into the new home or cold restore spawns in the
    // demoted checkout (Terminal.tsx cwd={tab.startupCwd ?? workspace.path}).
    const movedTab = (after.tabsByWorktree[DEFAULT_ID] ?? []).find((tab) => tab.id === TAB_SEL)
    expect(movedTab?.startupCwd).toBe('/repo/packages/app')
    const demotedTab = (after.tabsByWorktree[SEL_ID] ?? []).find((tab) => tab.id === TAB_REPO)
    expect(demotedTab?.startupCwd).toBeUndefined()
  })

  it('FIX: follow-mode wake mounts idle (restoreOnTabOpenOnly) agent tabs on both sides', async () => {
    seedModeBPostSleepState({ agentStates: { repo: 'done', sel: 'done' } })
    applyFollowMigrations()
    const { wakeFollowedSleptAgentsForWorktree } =
      await import('./wake-sleeping-agents-in-background')
    for (const worktreeId of [SEL_ID, DEFAULT_ID]) {
      wakeFollowedSleptAgentsForWorktree(worktreeId)
    }
    // The generic wake deliberately skips restoreOnTabOpenOnly records; the
    // follow-mode wake must include them so moved idle agents reappear without
    // a manual tab open. Each mount targets the record's own (migrated) tab.
    expect(mountRequests).toEqual([
      { worktreeId: SEL_ID, tabIds: [TAB_REPO] },
      { worktreeId: DEFAULT_ID, tabIds: [TAB_SEL] }
    ])
  })

  it('FIX: follow-mode wake mounts working agents into their preserved tabs — no fresh-tab forks', async () => {
    seedModeBPostSleepState()
    applyFollowMigrations()
    const { wakeFollowedSleptAgentsForWorktree } =
      await import('./wake-sleeping-agents-in-background')
    useAppStore.getState().setActiveWorktree(DEFAULT_ID)
    for (const worktreeId of [SEL_ID, DEFAULT_ID]) {
      wakeFollowedSleptAgentsForWorktree(worktreeId)
    }
    // Both sides mount the preserved (migrated) tab; neither side forks a new
    // resume tab (the generic wake forked one for the non-activated side).
    expect(mountRequests).toEqual([
      { worktreeId: SEL_ID, tabIds: [TAB_REPO] },
      { worktreeId: DEFAULT_ID, tabIds: [TAB_SEL] }
    ])
    const s = useAppStore.getState()
    expect((s.tabsByWorktree[DEFAULT_ID] ?? []).map((tab) => tab.id)).toEqual([TAB_SEL])
    expect((s.tabsByWorktree[SEL_ID] ?? []).map((tab) => tab.id)).toEqual([TAB_REPO])
  })

  it('FIX: snapshot re-seed revives records deleted by swap-window churn (observed live)', async () => {
    const { recordRepo, recordSel } = seedModeBPostSleepState()
    const { queueDefaultSwitchWake, consumeDefaultSwitchWake, clearDefaultSwitchWake } =
      await import('./default-worktree-switch-post-wake')
    const { wakeFollowedSleptAgentsForWorktree } =
      await import('./wake-sleeping-agents-in-background')
    clearDefaultSwitchWake()
    // WorktreeList queues the pair + a snapshot of the captured records.
    queueDefaultSwitchWake([SEL_ID, DEFAULT_ID], DEFAULT_ID, [recordRepo, recordSel])
    applyFollowMigrations()
    // Simulate the observed deleter: all fresh records vanish before the wake.
    useAppStore.setState({ sleepingAgentSessionsByPaneKey: {} } as never)

    const consumed = consumeDefaultSwitchWake([
      { oldWorktreeId: SEL_ID, newWorktreeId: TEMP_ID },
      { oldWorktreeId: DEFAULT_ID, newWorktreeId: SEL_ID },
      { oldWorktreeId: TEMP_ID, newWorktreeId: DEFAULT_ID }
    ])
    expect(consumed.worktreeIds).toHaveLength(2)
    const state = useAppStore.getState()
    const missing = consumed.records.filter(
      (record) => !state.sleepingAgentSessionsByPaneKey[record.paneKey]
    )
    expect(missing).toHaveLength(2)
    state.reseedSleepingAgentSessions(missing)

    // Records are back, re-keyed to their post-swap homes.
    const reseeded = useAppStore.getState().sleepingAgentSessionsByPaneKey
    expect(reseeded[PANE_KEY_REPO]?.worktreeId).toBe(SEL_ID)
    expect(reseeded[PANE_KEY_SEL]?.worktreeId).toBe(DEFAULT_ID)

    // And the follow wake now has something to mount on both sides.
    for (const worktreeId of consumed.worktreeIds) {
      wakeFollowedSleptAgentsForWorktree(worktreeId)
    }
    expect(mountRequests.map((req) => req.worktreeId).sort()).toEqual([DEFAULT_ID, SEL_ID])
  })
})

// Observed live (E2E, 2026-08-07): every recordless pane died across the swap —
// single-pane shell tabs vanished from tabOrder entirely, and a 3-pane split tab
// came back with 2. The tab-level ptyId survives the migration verbatim, so the
// first pane of each tab bare-attaches to the session the sleep already killed
// and the missed-exit reconciler closes it.
const SHELL_TAB = 'tab-shell'
const SPLIT_TAB = 'tab-split'
const LEAF_SHELL = '33333333-3333-4333-8333-333333333333'
const LEAF_SPLIT_A = '44444444-4444-4444-8444-444444444444'
const LEAF_SPLIT_B = '55555555-5555-4555-8555-555555555555'

describe('mode-B follow switch: recordless shell panes', () => {
  function seedShellTabsOnDefault(): void {
    seedModeBPostSleepState()
    const state = useAppStore.getState()
    useAppStore.setState({
      tabsByWorktree: {
        ...state.tabsByWorktree,
        [DEFAULT_ID]: [
          ...(state.tabsByWorktree[DEFAULT_ID] ?? []),
          makeTerminalTab(SHELL_TAB, DEFAULT_ID, `${DEFAULT_ID}@@pty-shell`),
          makeTerminalTab(SPLIT_TAB, DEFAULT_ID, `${DEFAULT_ID}@@pty-split-a`)
        ]
      },
      terminalLayoutsByTabId: {
        ...state.terminalLayoutsByTabId,
        [SHELL_TAB]: makeLayout(LEAF_SHELL, `${DEFAULT_ID}@@pty-shell`),
        [SPLIT_TAB]: {
          root: {
            type: 'split',
            direction: 'vertical',
            first: { type: 'leaf', leafId: LEAF_SPLIT_A },
            second: { type: 'leaf', leafId: LEAF_SPLIT_B }
          },
          activeLeafId: LEAF_SPLIT_A,
          expandedLeafId: null,
          ptyIdsByLeafId: {
            [LEAF_SPLIT_A]: `${DEFAULT_ID}@@pty-split-a`,
            [LEAF_SPLIT_B]: `${DEFAULT_ID}@@pty-split-b`
          }
        }
      }
    } as never)
  }

  it('migration alone leaves the shell tabs bound to their pre-swap PTY ids', () => {
    seedShellTabsOnDefault()
    applyFollowMigrations()

    // The tabs moved to the selected worktree; their ids still name the old home.
    const moved = useAppStore.getState().tabsByWorktree[SEL_ID] ?? []
    expect(moved.map((tab) => tab.id)).toContain(SHELL_TAB)
    expect(moved.find((tab) => tab.id === SHELL_TAB)?.ptyId).toBe(`${DEFAULT_ID}@@pty-shell`)
  })

  it('FIX: follow-mode wake mounts the recordless shell tabs too, so they respawn in place', async () => {
    seedShellTabsOnDefault()
    applyFollowMigrations()
    useAppStore.getState().releaseFollowSwitchShellPtyBindings([SEL_ID, DEFAULT_ID])
    const { wakeFollowedSleptAgentsForWorktree } =
      await import('./wake-sleeping-agents-in-background')
    for (const worktreeId of [SEL_ID, DEFAULT_ID]) {
      wakeFollowedSleptAgentsForWorktree(worktreeId)
    }
    // The shell tabs moved with the agent tab; mounting only the record-bearing
    // one left them PTY-less until the layout collapsed them away.
    const selMount = mountRequests.find((request) => request.worktreeId === SEL_ID)
    expect(selMount?.tabIds?.slice().sort()).toEqual([TAB_REPO, SHELL_TAB, SPLIT_TAB].sort())
  })

  it('FIX: the generic fallback may not consume a record whose tab still exists', async () => {
    // Observed live: a worktree that momentarily listed no live tabs sent EVERY
    // record through the generic fresh-tab resume, which consumes them. The
    // codex pane's record was gone by the time its preserved pane connected, so
    // the pane opened a plain shell instead of resuming.
    seedModeBPostSleepState()
    applyFollowMigrations()
    const { wakeFollowedSleptAgentsForWorktree } =
      await import('./wake-sleeping-agents-in-background')

    wakeFollowedSleptAgentsForWorktree(SEL_ID)

    // The preserved tab is mounted, and its record survives for the pane to use.
    expect(mountRequests.find((r) => r.worktreeId === SEL_ID)?.tabIds).toContain(TAB_REPO)
    expect(useAppStore.getState().sleepingAgentSessionsByPaneKey[PANE_KEY_REPO]).toBeDefined()
  })

  it('FIX: follow wake never forks a fresh tab, even when a record looks orphaned', async () => {
    // Observed live: right after the swap the tab list has not settled, so
    // records read as "tab is gone" and the generic resume minted a duplicate
    // tab for each — one claude and one codex came back as three tabs each.
    seedModeBPostSleepState()
    applyFollowMigrations()
    const { wakeFollowedSleptAgentsForWorktree } =
      await import('./wake-sleeping-agents-in-background')
    // Make every record look orphaned: no tab rows at all for this worktree.
    const state = useAppStore.getState()
    useAppStore.setState({
      tabsByWorktree: { ...state.tabsByWorktree, [SEL_ID]: [] }
    } as never)
    const tabsBefore = Object.keys(useAppStore.getState().tabsByWorktree[SEL_ID] ?? []).length

    wakeFollowedSleptAgentsForWorktree(SEL_ID)

    // No new tab is created, and the record survives for a later lazy restore.
    expect((useAppStore.getState().tabsByWorktree[SEL_ID] ?? []).length).toBe(tabsBefore)
    expect(useAppStore.getState().sleepingAgentSessionsByPaneKey[PANE_KEY_REPO]).toBeDefined()
  })

  it('FIX: the release drops recordless bindings, keeping every tab, pane and split', () => {
    seedShellTabsOnDefault()
    applyFollowMigrations()
    const released = useAppStore
      .getState()
      .releaseFollowSwitchShellPtyBindings([SEL_ID, DEFAULT_ID])
    expect(released).toBe(2)

    const s = useAppStore.getState()
    const moved = s.tabsByWorktree[SEL_ID] ?? []
    // Tabs survive, in order, with their PTY bindings dropped so they respawn.
    expect(moved.map((tab) => tab.id)).toEqual([TAB_REPO, SHELL_TAB, SPLIT_TAB])
    expect(moved.find((tab) => tab.id === SHELL_TAB)?.ptyId).toBeNull()
    expect(moved.find((tab) => tab.id === SPLIT_TAB)?.ptyId).toBeNull()
    expect(s.terminalLayoutsByTabId[SHELL_TAB]?.ptyIdsByLeafId).toEqual({})
    expect(s.terminalLayoutsByTabId[SPLIT_TAB]?.ptyIdsByLeafId).toEqual({})
    // The split tree itself is untouched — both panes still exist.
    expect(s.terminalLayoutsByTabId[SPLIT_TAB]?.root).toEqual({
      type: 'split',
      direction: 'vertical',
      first: { type: 'leaf', leafId: LEAF_SPLIT_A },
      second: { type: 'leaf', leafId: LEAF_SPLIT_B }
    })
    // The agent tab keeps its binding: its own cold-restore path clears it.
    expect(moved.find((tab) => tab.id === TAB_REPO)?.ptyId).toBe(PTY_REPO)
    expect(s.terminalLayoutsByTabId[TAB_REPO]?.ptyIdsByLeafId).toEqual({ [LEAF_REPO]: PTY_REPO })
  })
})
