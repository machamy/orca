import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
const updateRepo = vi.fn()
let storeState: {
  updateRepo: typeof updateRepo
  repos: { id: string; path: string }[]
}
vi.mock('../store', () => ({
  useAppStore: { getState: () => storeState }
}))

import { registerForkUiIpcListeners } from './fork-ui-ipc-listeners'

type OfferPayload = { repoId: string; worktreePath: string }

const offerListener: { current: ((payload: OfferPayload) => void) | null } = { current: null }
const offerUnsub = vi.fn()
const seedWorktreeCache = vi.fn()

function stubWindow(args: { offer?: boolean } = {}): void {
  const { offer = true } = args
  vi.stubGlobal('window', {
    api: {
      ui: {
        onUnityAutoSeedOffer: offer
          ? (cb: (payload: OfferPayload) => void) => {
              offerListener.current = cb
              return offerUnsub
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
  updateRepo.mockResolvedValue(undefined)
  seedWorktreeCache.mockResolvedValue({ seeded: true })
  storeState = {
    updateRepo,
    repos: [{ id: 'r1', path: '/repo' }]
  }
  stubWindow()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('registerForkUiIpcListeners registration', () => {
  it('registers the listener and its unsub tears it down', () => {
    const unsubs = registerForkUiIpcListeners()
    expect(unsubs).toHaveLength(1)
    expect(offerListener.current).toBeTypeOf('function')

    for (const unsub of unsubs) {
      unsub()
    }
    expect(offerUnsub).toHaveBeenCalledTimes(1)
  })

  it('tolerates the API missing (older preload / web) without throwing', () => {
    stubWindow({ offer: false })
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
