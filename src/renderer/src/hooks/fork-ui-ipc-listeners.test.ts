import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../shared/worktree/types'

const toastFn = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => toastFn(...args), {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args)
  })
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    values
      ? fallback.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(values[name] ?? ''))
      : fallback
}))
const breadcrumb = vi.fn()
vi.mock('@/lib/crash-breadcrumb-recorder', () => ({
  recordRendererCrashBreadcrumb: (...args: unknown[]) => breadcrumb(...args)
}))
const runFlow = vi.fn()
vi.mock('@/lib/default-worktree-switch-flow', () => ({
  runDefaultWorktreeSwitchFlow: (...args: unknown[]) => runFlow(...args)
}))
const updateRepo = vi.fn()
let storeState: {
  updateRepo: typeof updateRepo
  repos: { id: string; path: string }[]
  worktreesByRepo: Record<string, Worktree[]>
}
vi.mock('../store', () => ({
  useAppStore: { getState: () => storeState }
}))

import { registerForkUiIpcListeners } from './fork-ui-ipc-listeners'

type OfferPayload = { repoId: string; worktreePath: string }
type SwitchPayload = {
  repoId: string
  worktreeId: string
  followAgents: boolean
  notifyAgents: boolean
  includeUntracked?: boolean
}

function makeWorktree(id: string, path: string): Worktree {
  return {
    id,
    repoId: 'r1',
    path,
    head: 'abc',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree: false,
    displayName: id,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
}

const offerListener: { current: ((payload: OfferPayload) => void) | null } = { current: null }
const switchListener: { current: ((payload: SwitchPayload) => void) | null } = { current: null }
const offerUnsub = vi.fn()
const switchUnsub = vi.fn()
const seedWorktreeCache = vi.fn()

function stubWindow(args: { offer?: boolean; switchRequest?: boolean } = {}): void {
  const { offer = true, switchRequest = true } = args
  vi.stubGlobal('window', {
    api: {
      ui: {
        onUnityAutoSeedOffer: offer
          ? (cb: (payload: OfferPayload) => void) => {
              offerListener.current = cb
              return offerUnsub
            }
          : undefined,
        onDefaultWorktreeSwitchRequest: switchRequest
          ? (cb: (payload: SwitchPayload) => void) => {
              switchListener.current = cb
              return switchUnsub
            }
          : undefined
      },
      unity: { seedWorktreeCache }
    }
  })
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  offerListener.current = null
  switchListener.current = null
  updateRepo.mockResolvedValue(undefined)
  seedWorktreeCache.mockResolvedValue({ seeded: true })
  runFlow.mockResolvedValue({ repoId: 'r1' })
  storeState = {
    updateRepo,
    repos: [{ id: 'r1', path: '/repo' }],
    worktreesByRepo: {
      r1: [makeWorktree('r1::/repo', '/repo'), makeWorktree('r1::/wt/feature', '/wt/feature')]
    }
  }
  stubWindow()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('registerForkUiIpcListeners registration', () => {
  it('registers both listeners and each unsub tears down exactly one', () => {
    const unsubs = registerForkUiIpcListeners()
    expect(unsubs).toHaveLength(2)
    expect(offerListener.current).toBeTypeOf('function')
    expect(switchListener.current).toBeTypeOf('function')

    for (const unsub of unsubs) {
      unsub()
    }
    expect(offerUnsub).toHaveBeenCalledTimes(1)
    expect(switchUnsub).toHaveBeenCalledTimes(1)
  })

  it('tolerates one API missing (older preload / web) without throwing', () => {
    stubWindow({ offer: false })
    const unsubs = registerForkUiIpcListeners()
    expect(unsubs).toHaveLength(1)
    expect(switchListener.current).toBeTypeOf('function')

    stubWindow({ offer: false, switchRequest: false })
    expect(registerForkUiIpcListeners()).toHaveLength(0)
  })
})

describe('unity auto-seed offer', () => {
  function toastHandlers(): { action: () => void; cancel: () => void } {
    const options = toastFn.mock.calls[0]?.[1] as {
      action: { onClick: () => void }
      cancel: { onClick: () => void }
    }
    return { action: options.action.onClick, cancel: options.cancel.onClick }
  }

  it('only shows the toast on receipt — no repo update yet', () => {
    registerForkUiIpcListeners()
    offerListener.current?.({ repoId: 'r1', worktreePath: '/wt/new' })
    expect(toastFn).toHaveBeenCalledTimes(1)
    expect(updateRepo).not.toHaveBeenCalled()
    expect(seedWorktreeCache).not.toHaveBeenCalled()
  })

  it('action stores the choice and seeds with the exact payload', async () => {
    registerForkUiIpcListeners()
    offerListener.current?.({ repoId: 'r1', worktreePath: '/wt/new' })
    toastHandlers().action()
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', { unityAutoSeedCache: true })
    expect(seedWorktreeCache).toHaveBeenCalledWith({ worktreePath: '/wt/new', sourcePath: '/repo' })
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('does not await the repo update before seeding (pending update still seeds)', async () => {
    updateRepo.mockReturnValue(new Promise(() => {}))
    registerForkUiIpcListeners()
    offerListener.current?.({ repoId: 'r1', worktreePath: '/wt/new' })
    toastHandlers().action()
    await flush()
    expect(seedWorktreeCache).toHaveBeenCalledTimes(1)
  })

  it('cancel stores false and never seeds', async () => {
    registerForkUiIpcListeners()
    offerListener.current?.({ repoId: 'r1', worktreePath: '/wt/new' })
    toastHandlers().cancel()
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', { unityAutoSeedCache: false })
    expect(seedWorktreeCache).not.toHaveBeenCalled()
  })

  it('still records the choice when the repo vanished, but skips the seed', async () => {
    registerForkUiIpcListeners()
    offerListener.current?.({ repoId: 'r1', worktreePath: '/wt/new' })
    storeState = { ...storeState, repos: [] }
    toastHandlers().action()
    await flush()
    expect(updateRepo).toHaveBeenCalledTimes(1)
    expect(seedWorktreeCache).not.toHaveBeenCalled()
  })

  it('reports a failed seed with its reason', async () => {
    seedWorktreeCache.mockResolvedValue({ seeded: false, reason: 'source_editor_running' })
    registerForkUiIpcListeners()
    offerListener.current?.({ repoId: 'r1', worktreePath: '/wt/new' })
    toastHandlers().action()
    await flush()
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('source_editor_running'))
  })

  it('absorbs update and seed rejections', async () => {
    updateRepo.mockRejectedValue(new Error('offline'))
    seedWorktreeCache.mockRejectedValue(new Error('gone'))
    registerForkUiIpcListeners()
    offerListener.current?.({ repoId: 'r1', worktreePath: '/wt/new' })
    toastHandlers().action()
    await flush()
    // Reaching here without an unhandled rejection is the assertion.
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})

describe('default-switch request', () => {
  const base = {
    repoId: 'r1',
    worktreeId: 'r1::/wt/feature',
    followAgents: true,
    notifyAgents: false
  }

  it('runs the flow with both argument objects fixed', async () => {
    registerForkUiIpcListeners()
    switchListener.current?.({ ...base })
    await flush()
    expect(breadcrumb).toHaveBeenCalledWith('mode_b_cli_request', {
      worktreeId: 'r1::/wt/feature',
      found: true
    })
    expect(runFlow).toHaveBeenCalledWith(
      {
        source: storeState.worktreesByRepo.r1?.[1],
        currentDefault: storeState.worktreesByRepo.r1?.[0]
      },
      { agentsFollow: true, notifyAgents: false, sleepInPlace: false, includeUntracked: true }
    )
  })

  it('maps includeUntracked undefined→true and false→false', async () => {
    registerForkUiIpcListeners()
    switchListener.current?.({ ...base, includeUntracked: false })
    await flush()
    expect(runFlow).toHaveBeenLastCalledWith(expect.anything(), {
      agentsFollow: true,
      notifyAgents: false,
      sleepInPlace: false,
      includeUntracked: false
    })
  })

  it('no-ops with found:false when the repo is missing', () => {
    storeState = { ...storeState, repos: [] }
    registerForkUiIpcListeners()
    switchListener.current?.({ ...base })
    expect(breadcrumb).toHaveBeenCalledWith('mode_b_cli_request', {
      worktreeId: 'r1::/wt/feature',
      found: false
    })
    expect(runFlow).not.toHaveBeenCalled()
  })

  it('no-ops with found:false when the source worktree is missing', () => {
    registerForkUiIpcListeners()
    switchListener.current?.({ ...base, worktreeId: 'r1::/wt/gone' })
    expect(breadcrumb).toHaveBeenCalledWith('mode_b_cli_request', {
      worktreeId: 'r1::/wt/gone',
      found: false
    })
    expect(runFlow).not.toHaveBeenCalled()
  })

  it('no-ops with found:false when no row sits at the repo path', () => {
    storeState = {
      ...storeState,
      worktreesByRepo: { r1: [makeWorktree('r1::/wt/feature', '/wt/feature')] }
    }
    registerForkUiIpcListeners()
    switchListener.current?.({ ...base })
    expect(breadcrumb).toHaveBeenCalledWith('mode_b_cli_request', {
      worktreeId: 'r1::/wt/feature',
      found: false
    })
    expect(runFlow).not.toHaveBeenCalled()
  })

  it('no-ops with found:true when the source already is the default', () => {
    registerForkUiIpcListeners()
    switchListener.current?.({ ...base, worktreeId: 'r1::/repo' })
    expect(breadcrumb).toHaveBeenCalledWith('mode_b_cli_request', {
      worktreeId: 'r1::/repo',
      found: true
    })
    expect(runFlow).not.toHaveBeenCalled()
  })

  it('catches a rejected flow instead of leaking an unhandled rejection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    runFlow.mockRejectedValue(new Error('swap failed'))
    registerForkUiIpcListeners()
    switchListener.current?.({ ...base })
    await flush()
    expect(consoleError).toHaveBeenCalledWith('CLI default-switch flow failed:', expect.any(Error))
    consoleError.mockRestore()
  })
})
