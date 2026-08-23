// @vitest-environment happy-dom

import React, { type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { UnityWorktreeStatus } from '../../../../shared/unity-worktree'

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect
  }: {
    children: ReactNode
    disabled?: boolean
    onSelect?: () => void
  }) => (
    <div
      role="menuitem"
      aria-disabled={disabled === true}
      onClick={() => {
        if (!disabled) {
          onSelect?.()
        }
      }}
    >
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => (
    <div role="menuitem" aria-disabled={disabled === true} data-testid="tint-subtrigger">
      {children}
    </div>
  ),
  // aria-hidden mirrors reality (closed submenus are unreachable): the generic
  // role queries skip these rows; tint tests reach them via the testid.
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => (
    <div aria-hidden data-testid="tint-subcontent">
      {children}
    </div>
  )
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-testid="unity-confirm">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    disabled,
    onClick
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => (
    <button disabled={disabled === true} onClick={onClick}>
      {children}
    </button>
  )
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    values
      ? fallback.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(values[name] ?? ''))
      : fallback
}))
const toastError = vi.fn()
const toastInfo = vi.fn()
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    info: (...args: unknown[]) => toastInfo(...args),
    success: (...args: unknown[]) => toastSuccess(...args)
  }
}))

import { pickUnityWorktreeTint } from '../../../../shared/unity-worktree-tint-palette'
import { useUnityWorktreeMenu } from './worktree-unity-menu'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'r1::/wt/feature',
    repoId: 'r1',
    path: '/wt/feature',
    head: 'abc',
    branch: 'refs/heads/main',
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
  }
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

const READY_STATUS: UnityWorktreeStatus = {
  isUnityProject: true,
  editorVersion: '6000.3.16f1',
  editorInstalled: true,
  worktreeHasLibrary: false,
  sourceHasLibrary: true,
  riderInstalled: true
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// Stable default fixtures: a fresh object per render would change the probe
// effect's dependency identity and re-fire it, overwriting updated status.
const DEFAULT_WORKTREE = makeWorktree()
const DEFAULT_REPO = makeRepo()

const updateRepo = vi.fn()
const markUnityProjectRepoDetected = vi.fn()
const storeState = { updateRepo, markUnityProjectRepoDetected }
vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (state: unknown) => unknown) => selector(storeState), {
    getState: () => storeState
  })
}))

const worktreeStatus = vi.fn()
const seedWorktreeCache = vi.fn()
const openProject = vi.fn()
const openInRider = vi.fn()
const applyWorktreeTint = vi.fn()

function Harness(props: {
  worktree?: Worktree
  repo?: Repo | null
  menuOpen?: boolean
  isDeleting?: boolean
  allWorktrees?: readonly Worktree[]
  onPending?: (pending: boolean) => void
}): React.JSX.Element {
  const worktree = props.worktree ?? DEFAULT_WORKTREE
  const menu = useUnityWorktreeMenu({
    worktree,
    repo: props.repo === undefined ? DEFAULT_REPO : props.repo,
    menuOpen: props.menuOpen ?? true,
    isDeleting: props.isDeleting ?? false,
    allWorktrees: props.allWorktrees ?? [worktree]
  })
  props.onPending?.(menu.lifecyclePending)
  return (
    <div>
      <div data-testid="items">{menu.menuItems}</div>
      {menu.confirmDialog}
    </div>
  )
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  worktreeStatus.mockResolvedValue(READY_STATUS)
  seedWorktreeCache.mockResolvedValue({ seeded: true })
  openProject.mockResolvedValue({ opened: true })
  openInRider.mockResolvedValue({ opened: true, target: 'solution' })
  updateRepo.mockResolvedValue(undefined)
  applyWorktreeTint.mockResolvedValue({ applied: true, outcome: 'written' })
  Object.assign(window, {
    api: {
      unity: { worktreeStatus, seedWorktreeCache, openProject, openInRider, applyWorktreeTint }
    }
  })
})

afterEach(cleanup)

const items = (): HTMLElement[] => screen.queryAllByRole('menuitem')

describe('useUnityWorktreeMenu probe', () => {
  it('probes only while the menu is open, with the exact payload', async () => {
    const { rerender } = render(<Harness menuOpen={false} />)
    await flush()
    expect(worktreeStatus).not.toHaveBeenCalled()

    rerender(<Harness menuOpen={true} />)
    await flush()
    expect(worktreeStatus).toHaveBeenCalledTimes(1)
    expect(worktreeStatus).toHaveBeenCalledWith({
      worktreePath: '/wt/feature',
      sourcePath: '/repo'
    })
  })

  it('reports a sighted Unity project to the sidebar tint cache', async () => {
    render(<Harness menuOpen={true} />)
    await flush()
    // Keyed on the REPO, not the worktree: the sidebar caches one answer per repo.
    expect(markUnityProjectRepoDetected).toHaveBeenCalledWith('r1', '/repo')
  })

  it('never reports a no, since this branch may simply lack the Unity files', async () => {
    worktreeStatus.mockResolvedValue({ ...READY_STATUS, isUnityProject: false })
    render(<Harness menuOpen={true} />)
    await flush()
    expect(markUnityProjectRepoDetected).not.toHaveBeenCalled()
  })

  it('ignores a first probe that resolves after reopen while the second is pending', async () => {
    const first = deferred<UnityWorktreeStatus>()
    const second = deferred<UnityWorktreeStatus>()
    worktreeStatus.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const { rerender } = render(<Harness menuOpen={true} />)
    rerender(<Harness menuOpen={false} />)
    rerender(<Harness menuOpen={true} />)
    // Reopened: second probe pending. NOW the stale first answer arrives.
    await act(async () => {
      first.resolve({ ...READY_STATUS, riderInstalled: false })
      await Promise.resolve()
    })
    expect(items()).toHaveLength(0)

    await act(async () => {
      second.resolve(READY_STATUS)
      await Promise.resolve()
    })
    expect(items()).toHaveLength(4)
  })
})

describe('useUnityWorktreeMenu target invalidation', () => {
  it('drops the previous worktree’s status the moment the target is swapped', async () => {
    const pending = deferred<UnityWorktreeStatus>()
    worktreeStatus.mockResolvedValueOnce(READY_STATUS).mockReturnValueOnce(pending.promise)
    const { rerender } = render(<Harness />)
    await flush()
    expect(items()).toHaveLength(4)

    // Agent Map retargets the live hook: nothing may render until the new probe answers.
    rerender(<Harness worktree={makeWorktree({ id: 'r1::/wt/other', path: '/wt/other' })} />)
    expect(items()).toHaveLength(0)

    await act(async () => {
      pending.resolve({ ...READY_STATUS, riderInstalled: false })
      await Promise.resolve()
    })
    // Seed + Open in Unity + the tint submenu trigger; no Rider on this probe.
    expect(items()).toHaveLength(3)
  })

  it('drops the status when the source repo is swapped under the same worktree', async () => {
    const pending = deferred<UnityWorktreeStatus>()
    worktreeStatus.mockResolvedValueOnce(READY_STATUS).mockReturnValueOnce(pending.promise)
    const { rerender } = render(<Harness />)
    await flush()
    expect(items()).toHaveLength(4)

    rerender(<Harness repo={makeRepo({ id: 'r2', path: '/other-repo' })} />)
    expect(items()).toHaveLength(0)
  })

  it('keeps a seed’s optimistic Library flag tied to the pair that was seeded', async () => {
    const seed = deferred<{ seeded: boolean }>()
    seedWorktreeCache.mockReturnValue(seed.promise)
    const other = makeWorktree({ id: 'r1::/wt/other', path: '/wt/other' })
    const { rerender } = render(<Harness />)
    await flush()
    fireEvent.click(screen.getByText('Copy Unity Cache (from Default)'))

    // The target moves on while the seed is in flight; its result must not
    // mark the new target's Library present.
    rerender(<Harness worktree={other} />)
    await flush()
    await act(async () => {
      seed.resolve({ seeded: true })
      await Promise.resolve()
    })
    await flush()
    expect(screen.queryByText('Unity Cache Already Present')).toBeNull()
    expect(screen.getByText('Copy Unity Cache (from Default)')).toBeTruthy()
  })
})

describe('useUnityWorktreeMenu default-row detection', () => {
  it('reads a Windows default checkout as the default row despite case and separators', async () => {
    worktreeStatus.mockResolvedValue({ ...READY_STATUS, worktreeHasLibrary: true })
    render(
      <Harness
        worktree={makeWorktree({ id: 'r1::win', path: 'c:/repo/' })}
        repo={makeRepo({ path: 'C:\\Repo' })}
      />
    )
    await flush()
    // Default row: no seed entry, and the tint is cleared rather than assigned.
    expect(screen.queryByText('Copy Unity Cache (from Default)')).toBeNull()
    fireEvent.click(screen.getByText('Open in Unity'))
    await flush()
    expect(openProject).toHaveBeenCalledWith({
      worktreePath: 'c:/repo/',
      tint: false,
      tintSiblingLabels: []
    })
  })

  it('never offers the seed dialog on a case-differing default checkout', async () => {
    render(
      <Harness
        worktree={makeWorktree({ id: 'r1::win', path: 'C:\\REPO' })}
        repo={makeRepo({ path: 'c:\\repo' })}
      />
    )
    await flush()
    fireEvent.click(screen.getByText('Open in Unity'))
    await flush()
    expect(screen.queryByTestId('unity-confirm')).toBeNull()
    expect(openProject).toHaveBeenCalledTimes(1)
  })
})

describe('useUnityWorktreeMenu tint sibling labels', () => {
  it('keeps non-local rows out of the local tint palette', async () => {
    const ssh = makeWorktree({
      id: 'r1::ssh',
      path: '/wt/ssh',
      hostId: 'ssh:x'
    } as Partial<Worktree>)
    const runtime = makeWorktree({
      id: 'r1::rt',
      path: '/wt/runtime',
      hostId: 'runtime:r1'
    } as Partial<Worktree>)
    const local = makeWorktree({ id: 'r1::/wt/other', path: '/wt/other' })
    render(<Harness allWorktrees={[makeWorktree(), ssh, runtime, local]} />)
    await flush()
    fireEvent.click(screen.getByText('Copy Unity Cache (from Default)'))
    await flush()
    expect(seedWorktreeCache).toHaveBeenCalledWith(
      expect.objectContaining({ tintSiblingLabels: ['feature', 'other'] })
    )
  })

  it('excludes the default checkout by runtime path equality, not raw string equality', async () => {
    const defaultRow = makeWorktree({ id: 'r1::win', path: 'C:\\Repo\\' })
    const sibling = makeWorktree({ id: 'r1::s', path: 'C:/Repo/../wt/other' })
    render(
      <Harness
        worktree={makeWorktree({ id: 'r1::win-wt', path: 'C:\\wt\\feature' })}
        repo={makeRepo({ path: 'c:/repo' })}
        allWorktrees={[
          makeWorktree({ id: 'r1::win-wt', path: 'C:\\wt\\feature' }),
          defaultRow,
          sibling
        ]}
      />
    )
    await flush()
    fireEvent.click(screen.getByText('Copy Unity Cache (from Default)'))
    await flush()
    expect(seedWorktreeCache).toHaveBeenCalledWith(
      expect.objectContaining({ tintSiblingLabels: ['feature', 'other'] })
    )
  })

  it('derives labels with the shared basename helper', async () => {
    const trailing = makeWorktree({ id: 'r1::t', path: '/wt/trailing///' })
    const win = makeWorktree({ id: 'r1::w', path: 'C:\\wt\\nested\\' })
    const rootish = makeWorktree({ id: 'r1::r', path: '/' })
    render(<Harness allWorktrees={[makeWorktree(), trailing, win, rootish]} />)
    await flush()
    fireEvent.click(screen.getByText('Copy Unity Cache (from Default)'))
    await flush()
    expect(seedWorktreeCache).toHaveBeenCalledWith(
      expect.objectContaining({ tintSiblingLabels: ['feature', 'trailing', 'nested', '/'] })
    )
  })
})

describe('useUnityWorktreeMenu gating', () => {
  const gateCases: [string, Partial<Parameters<typeof Harness>[0]>][] = [
    ['repo:null', { repo: null }],
    ['ssh repo', { repo: makeRepo({ connectionId: 'c1' } as Partial<Repo>) }],
    ['folder repo', { repo: makeRepo({ kind: 'folder' } as Partial<Repo>) }],
    ['remote worktree host', { worktree: makeWorktree({ hostId: 'ssh:x' } as Partial<Worktree>) }],
    [
      'runtime execution host',
      { repo: makeRepo({ executionHostId: 'runtime:r1' } as Partial<Repo>) }
    ]
  ]
  for (const [name, props] of gateCases) {
    it(`renders nothing for ${name}`, async () => {
      render(<Harness {...props} />)
      await flush()
      expect(items()).toHaveLength(0)
    })
  }

  it('renders nothing when the folder is not a Unity project', async () => {
    worktreeStatus.mockResolvedValue({ ...READY_STATUS, isUnityProject: false })
    render(<Harness />)
    await flush()
    expect(items()).toHaveLength(0)
  })

  it('treats undefined hostId and executionHostId as local', async () => {
    render(
      <Harness
        worktree={makeWorktree({ hostId: undefined } as Partial<Worktree>)}
        repo={makeRepo({ executionHostId: undefined } as Partial<Repo>)}
      />
    )
    await flush()
    expect(items()).toHaveLength(4)
  })
})

describe('useUnityWorktreeMenu item combinations', () => {
  const combos: [string, { defaultRow: boolean; rider: boolean }, number][] = [
    // Side rows also carry the tint submenu trigger; the default row stays
    // untinted so it never shows one.
    ['side worktree with Rider', { defaultRow: false, rider: true }, 4],
    ['side worktree without Rider', { defaultRow: false, rider: false }, 3],
    ['default row with Rider', { defaultRow: true, rider: true }, 2],
    ['default row without Rider', { defaultRow: true, rider: false }, 1]
  ]
  for (const [name, combo, expected] of combos) {
    it(`${name} → ${expected} items`, async () => {
      worktreeStatus.mockResolvedValue({ ...READY_STATUS, riderInstalled: combo.rider })
      render(
        <Harness
          worktree={makeWorktree(combo.defaultRow ? { path: '/repo', id: 'r1::/repo' } : {})}
        />
      )
      await flush()
      expect(items()).toHaveLength(expected)
    })
  }
})

describe('useUnityWorktreeMenu disabled contract', () => {
  it('disables every item while deleting', async () => {
    render(<Harness isDeleting={true} />)
    await flush()
    for (const item of items()) {
      expect(item.getAttribute('aria-disabled')).toBe('true')
    }
  })

  it('disables the cache item when the worktree already has a Library', async () => {
    worktreeStatus.mockResolvedValue({ ...READY_STATUS, worktreeHasLibrary: true })
    render(<Harness />)
    await flush()
    const cache = screen.getByText('Unity Cache Already Present').closest('[role="menuitem"]')
    expect(cache?.getAttribute('aria-disabled')).toBe('true')
  })

  it('disables the cache item when the source has no Library', async () => {
    worktreeStatus.mockResolvedValue({ ...READY_STATUS, sourceHasLibrary: false })
    render(<Harness />)
    await flush()
    const cache = screen.getByText('Copy Unity Cache (from Default)').closest('[role="menuitem"]')
    expect(cache?.getAttribute('aria-disabled')).toBe('true')
  })
})

describe('useUnityWorktreeMenu payload preservation', () => {
  it('passes the exact payloads for open, seed, and rider', async () => {
    const sibling = makeWorktree({ id: 'r1::/wt/other', path: '/wt/other' })
    const winSibling = makeWorktree({ id: 'r1::win', path: 'C:\\wt\\feature' } as Partial<Worktree>)
    const defaultRow = makeWorktree({ id: 'r1::/repo', path: '/repo' })
    // Library already present so "Open in Unity" opens directly (no dialog).
    worktreeStatus.mockResolvedValue({ ...READY_STATUS, worktreeHasLibrary: true })
    render(<Harness allWorktrees={[makeWorktree(), sibling, winSibling, defaultRow]} />)
    await flush()

    fireEvent.click(screen.getByText('Open in Unity'))
    await flush()
    expect(openProject).toHaveBeenCalledWith({
      worktreePath: '/wt/feature',
      tint: true,
      // Windows separators fold to the folder name; the repo-path row is excluded.
      tintSiblingLabels: ['feature', 'other', 'feature']
    })

    fireEvent.click(screen.getByText('Open in Rider'))
    await flush()
    expect(openInRider).toHaveBeenCalledWith({ worktreePath: '/wt/feature', sourcePath: '/repo' })
  })

  it('passes the seed payload with tint siblings', async () => {
    render(<Harness />)
    await flush()
    fireEvent.click(screen.getByText('Copy Unity Cache (from Default)'))
    await flush()
    expect(seedWorktreeCache).toHaveBeenCalledWith({
      worktreePath: '/wt/feature',
      sourcePath: '/repo',
      tint: true,
      tintSiblingLabels: ['feature']
    })
  })
})

describe('useUnityWorktreeMenu result branches', () => {
  it('reports a failed seed with its reason', async () => {
    seedWorktreeCache.mockResolvedValue({ seeded: false, reason: 'clone_failed', detail: 'disk' })
    render(<Harness />)
    await flush()
    fireEvent.click(screen.getByText('Copy Unity Cache (from Default)'))
    await flush()
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('clone_failed: disk'))
  })

  it('treats already_seeded as success and marks the library present', async () => {
    seedWorktreeCache.mockResolvedValue({ seeded: false, reason: 'already_seeded' })
    render(<Harness />)
    await flush()
    fireEvent.click(screen.getByText('Copy Unity Cache (from Default)'))
    await flush()
    expect(toastError).not.toHaveBeenCalled()
    // The cache item now reads as present (state updated).
    expect(screen.getByText('Unity Cache Already Present')).toBeTruthy()
  })

  it('names the missing editor version, hub-aware', async () => {
    worktreeStatus.mockResolvedValue({ ...READY_STATUS, worktreeHasLibrary: true })
    openProject.mockResolvedValue({
      opened: false,
      reason: 'editor_missing',
      editorVersion: '6000.1.1f1',
      hubOpened: true
    })
    render(<Harness />)
    await flush()
    fireEvent.click(screen.getByText('Open in Unity'))
    await flush()
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('6000.1.1f1'))
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Unity Hub'))
  })

  it('explains the Rider folder fallback', async () => {
    openInRider.mockResolvedValue({ opened: true, target: 'folder' })
    render(<Harness />)
    await flush()
    fireEvent.click(screen.getByText('Open in Rider'))
    await flush()
    expect(toastInfo).toHaveBeenCalledWith(expect.stringContaining('No .sln yet'))
  })
})

describe('useUnityWorktreeMenu confirm dialog and lifecycle', () => {
  async function openConfirm(onPending: (pending: boolean) => void): Promise<void> {
    render(<Harness onPending={onPending} />)
    await flush()
    fireEvent.click(screen.getByText('Open in Unity'))
    await flush()
    expect(screen.queryByTestId('unity-confirm')).toBeTruthy()
  }

  it('Cancel closes without any Unity API call', async () => {
    const pending = vi.fn()
    await openConfirm(pending)
    fireEvent.click(screen.getByText('Cancel'))
    await flush()
    expect(openProject).not.toHaveBeenCalled()
    expect(seedWorktreeCache).not.toHaveBeenCalled()
    expect(pending).toHaveBeenLastCalledWith(false)
  })

  it('Open Without Copying opens once without seeding', async () => {
    await openConfirm(vi.fn())
    fireEvent.click(screen.getByText('Open Without Copying'))
    await flush()
    expect(seedWorktreeCache).not.toHaveBeenCalled()
    expect(openProject).toHaveBeenCalledTimes(1)
  })

  it('Copy and Open opens only after the seed succeeds', async () => {
    const seed = deferred<{ seeded: boolean }>()
    seedWorktreeCache.mockReturnValue(seed.promise)
    const pending = vi.fn()
    await openConfirm(pending)

    fireEvent.click(screen.getByText('Copy and Open'))
    await flush()
    expect(pending).toHaveBeenLastCalledWith(true)
    expect(openProject).not.toHaveBeenCalled()

    await act(async () => {
      seed.resolve({ seeded: true })
      await Promise.resolve()
    })
    await flush()
    expect(openProject).toHaveBeenCalledTimes(1)
    expect(pending).toHaveBeenLastCalledWith(false)
  })

  it('Copy and Open does not open when the seed fails', async () => {
    seedWorktreeCache.mockResolvedValue({ seeded: false, reason: 'source_missing' })
    await openConfirm(vi.fn())
    fireEvent.click(screen.getByText('Copy and Open'))
    await flush()
    expect(openProject).not.toHaveBeenCalled()
  })
})

describe('useUnityWorktreeMenu tint colour submenu', () => {
  const sibling = makeWorktree({ id: 'r1::/wt/other', path: '/wt/other' })
  const subcontent = (): HTMLElement => screen.getByTestId('tint-subcontent')

  it('offers automatic, every palette colour, and a custom entry — side rows only', async () => {
    const { rerender } = render(<Harness />)
    await flush()
    const rows = within(subcontent()).getAllByText(/./, { selector: '[role="menuitem"]' })
    // Automatic + 10 palette entries + Custom.
    expect(rows).toHaveLength(12)

    rerender(<Harness worktree={makeWorktree({ path: '/repo', id: 'r1::/repo' })} />)
    await flush()
    expect(screen.queryByTestId('tint-subcontent')).toBeNull()
  })

  it('hides the submenu entirely when the repo turned the tint off', async () => {
    render(<Harness repo={makeRepo({ unityWorktreeTint: false } as Partial<Repo>)} />)
    await flush()
    expect(screen.queryByTestId('tint-subtrigger')).toBeNull()
  })

  it('stores a preset choice and re-writes the script with the exact payload', async () => {
    render(<Harness allWorktrees={[makeWorktree(), sibling]} />)
    await flush()
    fireEvent.click(within(subcontent()).getByText('Green'))
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      unityTintOverrides: { feature: '#a6e3a1' }
    })
    expect(applyWorktreeTint).toHaveBeenCalledWith({
      worktreePath: '/wt/feature',
      enabled: true,
      tintSiblingLabels: ['feature', 'other'],
      tintOverridesByLabel: { feature: '#a6e3a1' }
    })
  })

  it("disables a colour another worktree's override already uses", async () => {
    render(
      <Harness
        repo={makeRepo({ unityTintOverrides: { other: '#f38ba8' } } as Partial<Repo>)}
        allWorktrees={[makeWorktree(), sibling]}
      />
    )
    await flush()
    const red = within(subcontent()).getByText(/Red/).closest('[role="menuitem"]')
    expect(red?.getAttribute('aria-disabled')).toBe('true')
    expect(red?.textContent).toContain('(in use)')
    fireEvent.click(red as HTMLElement)
    await flush()
    expect(updateRepo).not.toHaveBeenCalled()
  })

  it('Automatic removes only this worktree from the stored overrides', async () => {
    render(
      <Harness
        repo={makeRepo({
          unityTintOverrides: { feature: '#89b4fa', other: '#f38ba8' }
        } as Partial<Repo>)}
        allWorktrees={[makeWorktree(), sibling]}
      />
    )
    await flush()
    fireEvent.click(within(subcontent()).getByText('Automatic'))
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      unityTintOverrides: { other: '#f38ba8' }
    })
  })

  it('applies a custom colour from the picker dialog', async () => {
    const pending = vi.fn()
    render(<Harness onPending={pending} />)
    await flush()
    fireEvent.click(within(subcontent()).getByText('Custom Color…'))
    await flush()
    expect(pending).toHaveBeenLastCalledWith(true)
    const input = screen.getByLabelText('Custom Unity Toolbar Color')
    fireEvent.change(input, { target: { value: '#123456' } })
    fireEvent.click(screen.getByText('Apply'))
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      unityTintOverrides: { feature: '#123456' }
    })
    expect(applyWorktreeTint).toHaveBeenCalledWith({
      worktreePath: '/wt/feature',
      enabled: true,
      tintSiblingLabels: ['feature'],
      tintOverridesByLabel: { feature: '#123456' }
    })
    expect(pending).toHaveBeenLastCalledWith(false)
  })

  it('stores an override for a worktree folder literally named __proto__', async () => {
    // Plain assignment would hit Object.prototype's setter and store nothing.
    const odd = makeWorktree({ id: 'r1::/wt/__proto__', path: '/wt/__proto__' })
    render(<Harness worktree={odd} allWorktrees={[odd]} />)
    await flush()
    fireEvent.click(within(subcontent()).getByText('Green'))
    await flush()
    const stored = updateRepo.mock.calls.at(-1)?.[1].unityTintOverrides
    expect(Object.hasOwn(stored, '__proto__')).toBe(true)
    expect(stored['__proto__']).toBe('#a6e3a1')
    // And it survives the JSON trip the repo record takes to disk.
    expect(JSON.parse(JSON.stringify(stored))['__proto__']).toBe('#a6e3a1')
  })

  it("blocks a duplicate even when it is this worktree's own current pick", async () => {
    // Past the palette size the automatic assignment runs out of free slots and
    // can land on a colour an override already holds — no exception for "mine".
    render(
      <Harness
        repo={makeRepo({
          unityTintOverrides: { feature: '#f38ba8', other: '#f38ba8' }
        } as Partial<Repo>)}
        allWorktrees={[makeWorktree(), sibling]}
      />
    )
    await flush()
    const red = within(subcontent()).getByText(/Red/).closest('[role="menuitem"]')
    expect(red?.textContent).toContain('(in use)')
    expect(red?.getAttribute('aria-disabled')).toBe('true')
  })

  it('rewrites a sibling whose automatic colour moved because of this choice', async () => {
    // Releasing an override frees a palette slot; whichever sibling shifts must
    // get its script rewritten now, or two open editors keep the same colour.
    const siblings = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].map((name) =>
      makeWorktree({ id: `r1::/wt/${name}`, path: `/wt/${name}` })
    )
    const all = [makeWorktree(), ...siblings]
    const labels = all.map((entry) => entry.path.split('/').at(-1) as string)
    const moved = labels.filter(
      (label) =>
        label !== 'feature' &&
        pickUnityWorktreeTint(label, labels, { feature: '#123456' }).hex !==
          pickUnityWorktreeTint(label, labels).hex
    )
    expect(moved.length).toBeGreaterThan(0)

    render(
      <Harness
        repo={makeRepo({ unityTintOverrides: { feature: '#123456' } } as Partial<Repo>)}
        allWorktrees={all}
      />
    )
    await flush()
    fireEvent.click(within(subcontent()).getByText('Automatic'))
    await flush()

    const rewritten = applyWorktreeTint.mock.calls.map(
      (call) => call[0].worktreePath.split('/').at(-1) as string
    )
    expect(rewritten).toContain('feature')
    for (const label of moved) {
      expect(rewritten).toContain(label)
    }
    // Untouched siblings stay untouched — no needless domain reloads.
    for (const label of labels.filter((label) => label !== 'feature' && !moved.includes(label))) {
      expect(rewritten).not.toContain(label)
    }
  })

  it('never sends a remote sibling path to the local tint writer', async () => {
    // applyWorktreeTint writes on this machine; an SSH row's path names a file
    // on another one. It may still take part in the colour maths (that filter
    // lives in the parent), but it must never be written to.
    const remote = makeWorktree({
      id: 'r1::/srv/remote-wt',
      path: '/srv/remote-wt',
      hostId: 'ssh:box'
    } as Partial<Worktree>)
    const local = makeWorktree({ id: 'r1::/wt/local-wt', path: '/wt/local-wt' })
    render(
      <Harness
        repo={makeRepo({ unityTintOverrides: { feature: '#123456' } } as Partial<Repo>)}
        allWorktrees={[makeWorktree(), local, remote]}
      />
    )
    await flush()
    fireEvent.click(within(subcontent()).getByText('Automatic'))
    await flush()

    const written = applyWorktreeTint.mock.calls.map((call) => call[0].worktreePath as string)
    expect(written).toContain('/wt/feature')
    expect(written).not.toContain('/srv/remote-wt')
  })

  it('derives the label from a Windows path with a trailing separator', async () => {
    const win = makeWorktree({ id: 'r1::win', path: 'C:\\wt\\feature-win\\' } as Partial<Worktree>)
    render(<Harness worktree={win} allWorktrees={[win]} />)
    await flush()
    fireEvent.click(within(subcontent()).getByText('Green'))
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      unityTintOverrides: { 'feature-win': '#a6e3a1' }
    })
  })

  it('refuses a custom colour a sibling deliberately picked', async () => {
    render(
      <Harness
        repo={makeRepo({ unityTintOverrides: { other: '#123456' } } as Partial<Repo>)}
        allWorktrees={[makeWorktree(), sibling]}
      />
    )
    await flush()
    fireEvent.click(within(subcontent()).getByText('Custom Color…'))
    await flush()
    fireEvent.change(screen.getByLabelText('Custom Unity Toolbar Color'), {
      target: { value: '#123456' }
    })
    expect(screen.getByText(/already uses this color/)).toBeTruthy()
    expect((screen.getByText('Apply') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByText('Apply'))
    await flush()
    expect(updateRepo).not.toHaveBeenCalled()
    expect(applyWorktreeTint).not.toHaveBeenCalled()
  })

  it('allows taking a colour a sibling only holds automatically', async () => {
    // Regression: blocking automatic colours too left every preset disabled on a
    // repo with as many worktrees as the palette has colours — nothing was
    // selectable. The automatic sibling moves aside instead.
    const siblingAutoHex = pickUnityWorktreeTint('other', ['feature', 'other']).hex
    render(<Harness allWorktrees={[makeWorktree(), sibling]} />)
    await flush()
    fireEvent.click(within(subcontent()).getByText('Custom Color…'))
    await flush()
    fireEvent.change(screen.getByLabelText('Custom Unity Toolbar Color'), {
      target: { value: siblingAutoHex }
    })
    expect(screen.queryByText(/already uses this color/)).toBeNull()
    fireEvent.click(screen.getByText('Apply'))
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      unityTintOverrides: { feature: siblingAutoHex }
    })
    // The displaced sibling gets its script rewritten in the same pass.
    const written = applyWorktreeTint.mock.calls.map((call) => call[0].worktreePath as string)
    expect(written).toContain('/wt/other')
  })

  it('leaves every preset selectable when the palette is saturated', async () => {
    // The real repro: eleven worktrees, ten colours. Before the fix all ten
    // presets read "(in use)" and the menu was inert.
    const many = Array.from({ length: 11 }, (_, index) =>
      makeWorktree({ id: `r1::/wt/w${index}`, path: `/wt/w${index}` })
    )
    render(<Harness allWorktrees={[makeWorktree(), ...many]} />)
    await flush()
    const rows = within(subcontent()).getAllByText(/./, { selector: '[role="menuitem"]' })
    const blocked = rows.filter((row) => row.getAttribute('aria-disabled') === 'true')
    expect(blocked).toHaveLength(0)
  })
})
