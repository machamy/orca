// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { Repo, UnitySidebarTintMode } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { UnityWorktreeStatus } from '../../../../shared/unity-worktree'
import type { UnityTintSidebarPreviewSlice } from '@/store/slices/unity-tint-sidebar-preview'
import type { UnityProjectRepoProbeSlice } from '@/store/slices/unity-project-repo-probe'

type TintStore = UnityTintSidebarPreviewSlice & UnityProjectRepoProbeSlice

// The real slices behind the mocked store: subscription semantics and the
// once-per-repo probe are under test, so hand-rolled stubs would prove nothing.
vi.mock('@/store', async () => {
  const { create } = await import('zustand')
  const { createUnityTintSidebarPreviewSlice } =
    await import('@/store/slices/unity-tint-sidebar-preview')
  const { createUnityProjectRepoProbeSlice } =
    await import('@/store/slices/unity-project-repo-probe')
  return {
    useAppStore: create<TintStore>()((...args) => ({
      ...createUnityTintSidebarPreviewSlice(
        ...(args as Parameters<typeof createUnityTintSidebarPreviewSlice>)
      ),
      ...createUnityProjectRepoProbeSlice(
        ...(args as Parameters<typeof createUnityProjectRepoProbeSlice>)
      )
    }))
  }
})
const worktreesForRepo = vi.fn<(repoId: string | null) => readonly Worktree[]>()
vi.mock('@/store/selectors', () => ({
  useWorktreesForRepo: (repoId: string | null) => worktreesForRepo(repoId)
}))

import { useAppStore } from '@/store'
import { pickUnityWorktreeTint } from '../../../../shared/unity-worktree-tint-palette'
import { useWorktreeSidebarUnityTint } from './use-worktree-sidebar-unity-tint'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'r1::/wt/feature',
    repoId: 'r1',
    path: '/wt/feature',
    head: 'abc',
    branch: 'refs/heads/feature',
    isBare: false,
    isMainWorktree: false,
    displayName: 'feature',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  } as Worktree
}

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'r1',
    path: '/repo',
    displayName: 'R',
    badgeColor: '#000',
    addedAt: 0,
    ...overrides
  } as Repo
}

const DEFAULT_ROW = makeWorktree({ id: 'r1::/repo', path: '/repo', isMainWorktree: true })
const SIBLINGS: readonly Worktree[] = [
  DEFAULT_ROW,
  makeWorktree(),
  makeWorktree({ id: 'r1::/wt/other', path: '/wt/other', displayName: 'other' }),
  makeWorktree({ id: 'r1::/wt/third', path: '/wt/third', displayName: 'third' })
]
const SIBLING_LABELS = ['feature', 'other', 'third']
const FEATURE_HEX = pickUnityWorktreeTint('feature', SIBLING_LABELS, undefined).hex

type Rendered = { hex: string | null; mode: UnitySidebarTintMode }

function unityStatus(isUnityProject: boolean): UnityWorktreeStatus {
  return {
    isUnityProject,
    editorVersion: null,
    editorInstalled: false,
    worktreeHasLibrary: false,
    sourceHasLibrary: false,
    riderInstalled: false
  }
}

/** The repo probe every test runs against; Unity by default. */
let worktreeStatus =
  vi.fn<(args: { worktreePath: string; sourcePath: string }) => Promise<UnityWorktreeStatus>>()

function stubUnityProbe(
  impl: (args: { worktreePath: string; sourcePath: string }) => Promise<UnityWorktreeStatus>
): void {
  worktreeStatus = vi.fn(impl)
  ;(window as unknown as { api?: unknown }).api = { unity: { worktreeStatus } }
}

function Probe({
  worktree,
  repo,
  onRender
}: {
  worktree: Worktree
  repo: Repo | null
  onRender: (tint: Rendered) => void
}): null {
  onRender(useWorktreeSidebarUnityTint(worktree, repo))
  return null
}

function mount(worktree: Worktree, repo: Repo | null): { current: Rendered } {
  const latest = { current: { hex: null, mode: 'off' } as Rendered }
  render(
    <Probe
      worktree={worktree}
      repo={repo}
      onRender={(tint) => {
        latest.current = tint
      }}
    />
  )
  return latest
}

/** Lets the mount-time probe resolve and the row re-render on the answer. */
async function settleProbe(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** The tint a freshly mounted row settles on once its repo has been probed. */
async function tintOf(worktree: Worktree, repo: Repo | null): Promise<Rendered> {
  cleanup()
  const latest = mount(worktree, repo)
  await settleProbe()
  return latest.current
}

function setPreview(repoId: string, mode: UnitySidebarTintMode | null): void {
  act(() => {
    useAppStore.getState().setUnityTintSidebarPreview(repoId, mode)
  })
}

beforeEach(() => {
  worktreesForRepo.mockImplementation((repoId) => (repoId === 'r1' ? SIBLINGS : []))
  stubUnityProbe(async () => unityStatus(true))
})

afterEach(() => {
  cleanup()
  const state = useAppStore.getState()
  for (const repoId of Object.keys(state.unityTintSidebarPreviewByRepoId)) {
    state.setUnityTintSidebarPreview(repoId, null)
  }
  useAppStore.setState({ unityProjectRepoProbeByRepoId: {} })
  delete (window as unknown as { api?: unknown }).api
  vi.clearAllMocks()
})

describe('useWorktreeSidebarUnityTint gates', () => {
  it('returns no tint without a repo', async () => {
    expect(await tintOf(makeWorktree(), null)).toEqual({ hex: null, mode: 'off' })
  })

  it('colours a Unity repo by default, with no setting saved', async () => {
    expect(await tintOf(makeWorktree(), makeRepo())).toEqual({ hex: FEATURE_HEX, mode: 'bar' })
  })

  it('returns no tint when the sidebar setting is explicitly off', async () => {
    expect(await tintOf(makeWorktree(), makeRepo({ unityTintInSidebar: 'off' }))).toEqual({
      hex: null,
      mode: 'off'
    })
  })

  it('returns no tint when the repo turned the Unity tint off entirely', async () => {
    expect((await tintOf(makeWorktree(), makeRepo({ unityWorktreeTint: false }))).hex).toBeNull()
  })

  it('returns no tint on the default checkout', async () => {
    expect((await tintOf(DEFAULT_ROW, makeRepo())).hex).toBeNull()
  })

  it('returns no tint for a non-local worktree', async () => {
    expect((await tintOf(makeWorktree({ hostId: 'ssh:host-1' }), makeRepo())).hex).toBeNull()
  })

  it('returns no tint for a repo Unity cannot run against', async () => {
    const cases: Partial<Repo>[] = [
      { kind: 'folder' },
      { connectionId: 'ssh-1' },
      { executionHostId: 'runtime:remote-1' }
    ]
    for (const overrides of cases) {
      expect(await tintOf(makeWorktree(), makeRepo(overrides))).toEqual({ hex: null, mode: 'off' })
    }
    expect(worktreeStatus).not.toHaveBeenCalled()
  })

  it('reports the saved mode alongside the colour', async () => {
    expect((await tintOf(makeWorktree(), makeRepo({ unityTintInSidebar: 'chip' }))).mode).toBe(
      'chip'
    )
  })

  it('reads a legacy boolean setting as bar, and legacy false as off', async () => {
    const legacy = makeRepo({ unityTintInSidebar: true as unknown as UnitySidebarTintMode })
    expect(await tintOf(makeWorktree(), legacy)).toEqual({ hex: FEATURE_HEX, mode: 'bar' })
    const legacyOff = makeRepo({ unityTintInSidebar: false as unknown as UnitySidebarTintMode })
    expect(await tintOf(makeWorktree(), legacyOff)).toEqual({ hex: null, mode: 'off' })
  })

  it('does not slice the worktree store while the row shows nothing', async () => {
    await tintOf(makeWorktree(), makeRepo({ unityTintInSidebar: 'off' }))
    expect(worktreesForRepo).toHaveBeenCalledWith(null)
    expect(worktreesForRepo).not.toHaveBeenCalledWith('r1')
  })
})

describe('useWorktreeSidebarUnityTint Unity gate', () => {
  it('renders nothing for a plain git repo even though the default is on', async () => {
    stubUnityProbe(async () => unityStatus(false))
    expect(await tintOf(makeWorktree(), makeRepo())).toEqual({ hex: null, mode: 'off' })
  })

  it('renders nothing while the answer is still unknown', () => {
    stubUnityProbe(() => new Promise(() => {}))
    cleanup()
    const latest = mount(makeWorktree(), makeRepo())
    expect(latest.current).toEqual({ hex: null, mode: 'off' })
    expect(useAppStore.getState().unityProjectRepoProbeByRepoId.r1?.state).toBe('pending')
  })

  it('lights the row up once the probe answers', () => {
    stubUnityProbe(() => new Promise(() => {}))
    cleanup()
    const latest = mount(makeWorktree(), makeRepo())
    expect(latest.current.hex).toBeNull()

    act(() => {
      useAppStore.getState().markUnityProjectRepoDetected('r1', '/repo')
    })

    expect(latest.current).toEqual({ hex: FEATURE_HEX, mode: 'bar' })
  })

  it('probes the repo once no matter how many rows render', async () => {
    cleanup()
    render(
      <>
        <Probe worktree={makeWorktree()} repo={makeRepo()} onRender={() => {}} />
        <Probe
          worktree={makeWorktree({ id: 'r1::/wt/other', path: '/wt/other' })}
          repo={makeRepo()}
          onRender={() => {}}
        />
        <Probe
          worktree={makeWorktree({ id: 'r1::/wt/third', path: '/wt/third' })}
          repo={makeRepo()}
          onRender={() => {}}
        />
      </>
    )
    await settleProbe()

    expect(worktreeStatus).toHaveBeenCalledTimes(1)
    expect(worktreeStatus).toHaveBeenCalledWith({ worktreePath: '/repo', sourcePath: '/repo' })
  })

  it('never probes while the row would show nothing anyway', async () => {
    await tintOf(makeWorktree(), makeRepo({ unityTintInSidebar: 'off' }))
    await tintOf(DEFAULT_ROW, makeRepo())
    await tintOf(makeWorktree(), makeRepo({ unityWorktreeTint: false }))
    expect(worktreeStatus).not.toHaveBeenCalled()
  })
})

describe('useWorktreeSidebarUnityTint preview', () => {
  it('turns a row on for a repo whose saved mode is off', async () => {
    cleanup()
    const latest = mount(makeWorktree(), makeRepo({ unityTintInSidebar: 'off' }))
    expect(latest.current.hex).toBeNull()

    setPreview('r1', 'bar')
    await settleProbe()

    expect(latest.current).toEqual({ hex: FEATURE_HEX, mode: 'bar' })
  })

  it('turns a row off for a repo whose saved mode is chip', async () => {
    cleanup()
    const latest = mount(makeWorktree(), makeRepo({ unityTintInSidebar: 'chip' }))
    await settleProbe()
    expect(latest.current.mode).toBe('chip')

    setPreview('r1', 'off')

    expect(latest.current).toEqual({ hex: null, mode: 'off' })
  })

  it('restores the saved mode when the preview is cleared', async () => {
    cleanup()
    const latest = mount(makeWorktree(), makeRepo({ unityTintInSidebar: 'chip' }))
    await settleProbe()
    setPreview('r1', 'wash')
    expect(latest.current.mode).toBe('wash')

    setPreview('r1', null)

    expect(latest.current.mode).toBe('chip')
  })

  it('never lets a preview defeat the repo-level gates', async () => {
    const cases: Worktree[] = [DEFAULT_ROW, makeWorktree({ hostId: 'ssh:host-1' })]
    for (const worktree of cases) {
      cleanup()
      const latest = mount(worktree, makeRepo())
      setPreview('r1', 'wash')
      await settleProbe()
      expect(latest.current).toEqual({ hex: null, mode: 'off' })
      setPreview('r1', null)
    }

    cleanup()
    const tintOff = mount(makeWorktree(), makeRepo({ unityWorktreeTint: false }))
    setPreview('r1', 'wash')
    await settleProbe()
    expect(tintOff.current).toEqual({ hex: null, mode: 'off' })
  })

  it('never lets a preview defeat the Unity gate', async () => {
    stubUnityProbe(async () => unityStatus(false))
    cleanup()
    const latest = mount(makeWorktree(), makeRepo({ unityTintInSidebar: 'off' }))

    setPreview('r1', 'wash')
    await settleProbe()

    expect(latest.current).toEqual({ hex: null, mode: 'off' })
    expect(useAppStore.getState().unityProjectRepoProbeByRepoId.r1?.state).toBe('no')
  })

  it('leaves other repos alone when one repo is previewed', async () => {
    const otherRepoWorktree = makeWorktree({
      id: 'r2::/wt/feature',
      repoId: 'r2',
      path: '/wt/feature'
    })
    worktreesForRepo.mockImplementation((repoId) =>
      repoId === 'r1' ? SIBLINGS : repoId === 'r2' ? [otherRepoWorktree] : []
    )
    const renderCounts = { r1: 0, r2: 0 }
    cleanup()
    render(
      <>
        <Probe
          worktree={makeWorktree()}
          repo={makeRepo()}
          onRender={() => {
            renderCounts.r1 += 1
          }}
        />
        <Probe
          worktree={otherRepoWorktree}
          repo={makeRepo({ id: 'r2', path: '/repo-2' })}
          onRender={() => {
            renderCounts.r2 += 1
          }}
        />
      </>
    )
    await settleProbe()
    const baseline = { ...renderCounts }

    setPreview('r1', 'wash')

    expect(renderCounts.r1).toBeGreaterThan(baseline.r1)
    expect(renderCounts.r2).toBe(baseline.r2)
  })
})
