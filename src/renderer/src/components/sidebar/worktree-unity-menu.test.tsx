// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { UnityWorktreeStatus } from '../../../../shared/unity-worktree'
import {
  READY_STATUS,
  createAppStoreMock,
  createButtonMock,
  createDialogMock,
  createDropdownMenuMock,
  createHarness,
  createI18nMock,
  createSonnerMock,
  deferred,
  flush,
  makeRepo,
  makeWorktree,
  markUnityProjectRepoDetected,
  openInRider,
  openProject,
  resetUnityMenuMocks,
  seedWorktreeCache,
  toastError,
  toastInfo,
  worktreeStatus
} from './worktree-unity-menu-test-harness'

vi.mock('@/components/ui/dropdown-menu', () => createDropdownMenuMock())
vi.mock('@/components/ui/dialog', () => createDialogMock())
vi.mock('@/components/ui/button', () => createButtonMock())
vi.mock('@/i18n/i18n', () => createI18nMock())
vi.mock('sonner', () => createSonnerMock())
vi.mock('@/store', () => createAppStoreMock())

// Imported AFTER the harness on purpose: the mock factories above read the
// harness namespace, which must be fully initialized before this pulls the
// mocked modules in.
import { useUnityWorktreeMenu } from './worktree-unity-menu'

const Harness = createHarness(useUnityWorktreeMenu)

beforeEach(resetUnityMenuMocks)
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
