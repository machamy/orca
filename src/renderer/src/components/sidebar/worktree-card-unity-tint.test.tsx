// @vitest-environment happy-dom

import React, { type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { Repo, UnitySidebarTintMode } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { UnityWorktreeStatus } from '../../../../shared/unity-worktree'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
const updateRepo = vi.fn()
const markUnityProjectRepoDetected = vi.fn()
const probeUnityProjectRepo = vi.fn()
// A static store: the probe cache is pre-seeded per test rather than resolved,
// so these cases test the treatments and the gates, not the probe's timing.
const storeState = {
  updateRepo,
  markUnityProjectRepoDetected,
  probeUnityProjectRepo,
  unityTintSidebarPreviewByRepoId: {} as Record<string, string>,
  unityProjectRepoProbeByRepoId: {} as Record<string, { path: string; state: string }>
}
vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (state: unknown) => unknown) => selector(storeState), {
    getState: () => storeState
  })
}))
// The row subscribes per repo; the fixture answers for the repo under test only.
const worktreesForRepo = vi.fn<(repoId: string | null) => readonly Worktree[]>()
vi.mock('@/store/selectors', () => ({
  useWorktreesForRepo: (repoId: string | null) => worktreesForRepo(repoId)
}))
// Menu-side mocks: the cross-check renders the real context-menu hook.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <div data-testid="tint-subtrigger">{children}</div>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }))

import { pickUnityWorktreeTint } from '../../../../shared/unity-worktree-tint-palette'
import { useWorktreeSidebarUnityTint } from './use-worktree-sidebar-unity-tint'
import { WorktreeCardUnityTint } from './worktree-card-unity-tint'
import { useUnityWorktreeMenu } from './worktree-unity-menu'

const TINT_SELECTOR = '[data-worktree-unity-tint]'

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
    unityTintInSidebar: 'bar',
    ...overrides
  } as Repo
}

const DEFAULT_ROW = makeWorktree({ id: 'r1::/repo', path: '/repo', isMainWorktree: true })
const SIBLINGS = [
  DEFAULT_ROW,
  makeWorktree(),
  makeWorktree({ id: 'r1::/wt/other', path: '/wt/other', displayName: 'other' }),
  makeWorktree({ id: 'r1::/wt/third', path: '/wt/third', displayName: 'third' })
]

/** The one node a treatment may add to a row, or null when it adds nothing. */
function renderTint(
  hex: string | null,
  mode: UnitySidebarTintMode,
  className?: string
): { node: HTMLElement | null; addedNodes: number } {
  cleanup()
  const { container } = render(
    <WorktreeCardUnityTint hex={hex} mode={mode} className={className} />
  )
  return {
    node: container.querySelector<HTMLElement>(TINT_SELECTOR),
    addedNodes: container.childNodes.length
  }
}

function Probe({
  worktree,
  repo
}: {
  worktree: Worktree
  repo: Repo | null
}): React.JSX.Element | null {
  const { hex, mode } = useWorktreeSidebarUnityTint(worktree, repo)
  return <WorktreeCardUnityTint hex={hex} mode={mode} />
}

function renderRow(worktree: Worktree, repo: Repo | null): HTMLElement | null {
  // Fresh DOM per call: the query below is document-wide.
  cleanup()
  render(<Probe worktree={worktree} repo={repo} />)
  return document.querySelector<HTMLElement>(TINT_SELECTOR)
}

function rowHex(worktree: Worktree, repo: Repo | null): string | null {
  return renderRow(worktree, repo)?.getAttribute('data-worktree-unity-tint') ?? null
}

const READY_STATUS: UnityWorktreeStatus = {
  isUnityProject: true,
  editorVersion: '6000.3.16f1',
  editorInstalled: true,
  worktreeHasLibrary: true,
  sourceHasLibrary: true,
  riderInstalled: false
}

function MenuHarness({
  worktree,
  repo,
  allWorktrees
}: {
  worktree: Worktree
  repo: Repo
  allWorktrees: readonly Worktree[]
}): React.JSX.Element {
  const menu = useUnityWorktreeMenu({
    worktree,
    repo,
    menuOpen: true,
    isDeleting: false,
    allWorktrees
  })
  return <div>{menu.menuItems}</div>
}

/** The colour the Unity Toolbar Color submenu previews for this worktree. */
async function menuHex(
  worktree: Worktree,
  repo: Repo,
  allWorktrees: readonly Worktree[]
): Promise<string | null> {
  render(<MenuHarness worktree={worktree} repo={repo} allWorktrees={allWorktrees} />)
  await act(async () => {
    await Promise.resolve()
  })
  const swatch = screen.getByTestId('tint-subtrigger').querySelector<HTMLElement>('span[style]')
  return swatch?.style.backgroundColor ?? null
}

/** happy-dom may hand back either notation, so compare on one. */
function toHex(color: string): string {
  const rgb = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color)
  if (!rgb) {
    return color.toLowerCase()
  }
  return `#${rgb
    .slice(1)
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')}`
}

beforeEach(() => {
  vi.clearAllMocks()
  storeState.unityTintSidebarPreviewByRepoId = {}
  storeState.unityProjectRepoProbeByRepoId = { r1: { path: '/repo', state: 'yes' } }
  worktreesForRepo.mockImplementation((repoId) => (repoId === 'r1' ? SIBLINGS : []))
  Object.assign(window, {
    api: {
      unity: {
        worktreeStatus: vi.fn().mockResolvedValue(READY_STATUS),
        seedWorktreeCache: vi.fn(),
        openProject: vi.fn(),
        openInRider: vi.fn(),
        applyWorktreeTint: vi.fn()
      }
    }
  })
})

afterEach(cleanup)

describe('WorktreeCardUnityTint treatments', () => {
  it('draws the left edge accent bar for bar mode', () => {
    const { node } = renderTint('#89b4fa', 'bar')
    expect(node?.getAttribute('data-worktree-unity-tint-mode')).toBe('bar')
    expect(node?.className).toContain('left-1')
    expect(node?.className).toContain('w-[3px]')
    expect(toHex(node?.style.backgroundColor ?? '')).toBe('#89b4fa')
  })

  it('draws the low-alpha row wash for wash mode, under the row content', () => {
    const { node } = renderTint('#89b4fa', 'wash')
    expect(node?.getAttribute('data-worktree-unity-tint-mode')).toBe('wash')
    expect(node?.className).toContain('inset-0')
    // Below every glyph, and weaker than the row's own hover/active washes.
    expect(node?.className).toContain('-z-10')
    expect(node?.className).toMatch(/opacity-\[0\.\d+\]/)
    expect(node?.className).toContain('dark:opacity-')
  })

  it('draws the trailing chip for chip mode', () => {
    const { node } = renderTint('#89b4fa', 'chip')
    expect(node?.getAttribute('data-worktree-unity-tint-mode')).toBe('chip')
    expect(node?.className).toContain('right-0.5')
    expect(node?.className).toContain('w-[10px]')
    expect(node?.className).toContain('h-[5px]')
  })

  it('keeps every treatment out of the row layout and out of the hit test', () => {
    for (const mode of ['bar', 'wash', 'chip'] as const) {
      const { node } = renderTint('#89b4fa', mode)
      expect(node?.className).toContain('absolute')
      expect(node?.className).toContain('pointer-events-none')
    }
  })

  it('lets the card re-anchor the chip without losing the treatment', () => {
    const { node } = renderTint('#89b4fa', 'chip', 'top-[15.5px]')
    expect(node?.className).toContain('top-[15.5px]')
    expect(node?.className).not.toContain('top-[12.5px]')
    expect(node?.className).toContain('w-[10px]')
  })

  it('hides the decorative treatment from assistive tech', () => {
    const { node } = renderTint('#89b4fa', 'bar')
    expect(node?.getAttribute('aria-hidden')).toBe('true')
    expect(node?.getAttribute('role')).toBeNull()
    expect(node?.getAttribute('aria-label')).toBeNull()
  })
})

describe('WorktreeCardUnityTint absence', () => {
  it('adds nothing to the row for off mode', () => {
    expect(renderTint('#89b4fa', 'off')).toEqual({ node: null, addedNodes: 0 })
  })

  it('adds nothing to the row without a colour, whatever the mode', () => {
    for (const mode of ['off', 'bar', 'wash', 'chip'] as const) {
      expect(renderTint(null, mode)).toEqual({ node: null, addedNodes: 0 })
    }
  })
})

describe('WorktreeCardUnityTint gates', () => {
  it('renders nothing without a repo', () => {
    expect(renderRow(makeWorktree(), null)).toBeNull()
  })

  it('renders the bar when nothing is saved, and nothing for an explicit off', () => {
    expect(
      renderRow(makeWorktree(), makeRepo({ unityTintInSidebar: undefined }))?.getAttribute(
        'data-worktree-unity-tint-mode'
      )
    ).toBe('bar')
    expect(renderRow(makeWorktree(), makeRepo({ unityTintInSidebar: 'off' }))).toBeNull()
  })

  it('renders nothing for a repo that is not a Unity project', () => {
    storeState.unityProjectRepoProbeByRepoId = { r1: { path: '/repo', state: 'no' } }
    expect(renderRow(makeWorktree(), makeRepo())).toBeNull()
  })

  it('renders nothing while the Unity answer is still unknown', () => {
    storeState.unityProjectRepoProbeByRepoId = { r1: { path: '/repo', state: 'pending' } }
    expect(renderRow(makeWorktree(), makeRepo())).toBeNull()
    storeState.unityProjectRepoProbeByRepoId = {}
    expect(renderRow(makeWorktree(), makeRepo())).toBeNull()
  })

  it('renders nothing when the repo turned the Unity tint off entirely', () => {
    expect(renderRow(makeWorktree(), makeRepo({ unityWorktreeTint: false }))).toBeNull()
  })

  it('renders nothing on the default checkout', () => {
    expect(renderRow(DEFAULT_ROW, makeRepo())).toBeNull()
  })

  it('renders nothing for a non-local worktree', () => {
    expect(renderRow(makeWorktree({ hostId: 'ssh:host-1' }), makeRepo())).toBeNull()
  })

  it('renders the repo-chosen treatment when every gate passes', () => {
    for (const mode of ['bar', 'wash', 'chip'] as const) {
      const node = renderRow(makeWorktree(), makeRepo({ unityTintInSidebar: mode }))
      expect(node?.getAttribute('data-worktree-unity-tint')).toMatch(/^#[0-9a-f]{6}$/)
      expect(node?.getAttribute('data-worktree-unity-tint-mode')).toBe(mode)
    }
  })
})

describe('WorktreeCardUnityTint colour', () => {
  it('picks the palette colour for the folder name, avoiding sibling collisions', () => {
    const siblingLabels = ['feature', 'other', 'third']
    expect(rowHex(makeWorktree(), makeRepo())).toBe(
      pickUnityWorktreeTint('feature', siblingLabels, undefined).hex
    )
    expect(rowHex(makeWorktree({ id: 'r1::/wt/other', path: '/wt/other' }), makeRepo())).toBe(
      pickUnityWorktreeTint('other', siblingLabels, undefined).hex
    )
  })

  it('honours a manual override for this folder', () => {
    const repo = makeRepo({ unityTintOverrides: { feature: '#f38ba8' } })
    expect(rowHex(makeWorktree(), repo)).toBe('#f38ba8')
  })

  it('subscribes only to its own repo, not to every worktree in the app', () => {
    renderRow(makeWorktree(), makeRepo())
    expect(worktreesForRepo).toHaveBeenCalledWith('r1')
    expect(worktreesForRepo).not.toHaveBeenCalledWith(null)
  })
})

describe('WorktreeCardUnityTint agrees with the Unity menu', () => {
  it.each([
    ['/wt/feature', {}],
    ['/wt/other', {}],
    ['/wt/third', { unityTintOverrides: { other: '#f38ba8' } }]
  ])('matches the submenu swatch for %s', async (path, repoOverrides) => {
    const worktree = makeWorktree({ id: `r1::${path}`, path })
    const repo = makeRepo(repoOverrides as Partial<Repo>)
    const hex = rowHex(worktree, repo)
    cleanup()
    expect(hex).not.toBeNull()
    expect(toHex((await menuHex(worktree, repo, SIBLINGS)) ?? '')).toBe(toHex(hex as string))
  })
})
