/**
 * Shared rig for the Unity worktree menu tests, split across two files (the
 * lifecycle/probe suite and the tint-colour suite) because one file of both
 * outgrows the test max-lines budget.
 *
 * The `vi.mock` calls themselves must stay in each test file — only their
 * factory bodies live here, following `worktree-list-lineage-card-test-harness`.
 */

import React, { type ReactNode } from 'react'
import { type Mock, vi } from 'vitest'
import { act } from '@testing-library/react'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { UnityWorktreeStatus } from '../../../../shared/unity-worktree'
// Type-only: a runtime import here would pull the mocked modules in while this
// module is still initializing, and every `vi.mock` factory that reads an export
// of it would explode on a half-built namespace.
import type { useUnityWorktreeMenu } from './worktree-unity-menu'

export function createDropdownMenuMock(): Record<string, unknown> {
  return {
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
    DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
      <div data-testid="tint-group-label">{children}</div>
    ),
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuSub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DropdownMenuSubTrigger: ({
      children,
      disabled
    }: {
      children: ReactNode
      disabled?: boolean
    }) => (
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
  }
}

export function createDialogMock(): Record<string, unknown> {
  return {
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div data-testid="unity-confirm">{children}</div> : null,
    DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>
  }
}

export function createButtonMock(): Record<string, unknown> {
  return {
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
  }
}

export function createI18nMock(): Record<string, unknown> {
  return {
    translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
      values
        ? fallback.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(values[name] ?? ''))
        : fallback
  }
}

export const toastError: Mock = vi.fn()
export const toastInfo: Mock = vi.fn()
export const toastSuccess: Mock = vi.fn()

export function createSonnerMock(): Record<string, unknown> {
  return {
    toast: {
      error: (...args: unknown[]) => toastError(...args),
      info: (...args: unknown[]) => toastInfo(...args),
      success: (...args: unknown[]) => toastSuccess(...args)
    }
  }
}

export const updateRepo: Mock = vi.fn()
export const markUnityProjectRepoDetected: Mock = vi.fn()
const storeState = { updateRepo, markUnityProjectRepoDetected }

export function createAppStoreMock(): Record<string, unknown> {
  return {
    useAppStore: Object.assign((selector: (state: unknown) => unknown) => selector(storeState), {
      getState: () => storeState
    })
  }
}

export const worktreeStatus: Mock = vi.fn()
export const seedWorktreeCache: Mock = vi.fn()
export const openProject: Mock = vi.fn()
export const openInRider: Mock = vi.fn()
export const applyWorktreeTint: Mock = vi.fn()

export function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
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

export function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'r1',
    path: '/repo',
    displayName: 'R',
    badgeColor: '#000',
    addedAt: 0,
    ...overrides
  } as Repo
}

export const READY_STATUS: UnityWorktreeStatus = {
  isUnityProject: true,
  editorVersion: '6000.3.16f1',
  editorInstalled: true,
  worktreeHasLibrary: false,
  sourceHasLibrary: true,
  riderInstalled: true
}

export type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }
export function deferred<T>(): Deferred<T> {
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

export type HarnessProps = {
  worktree?: Worktree
  repo?: Repo | null
  menuOpen?: boolean
  isDeleting?: boolean
  allWorktrees?: readonly Worktree[]
  onPending?: (pending: boolean) => void
}

/** The hook comes from the caller so this module never imports it — see above. */
export function createHarness(
  useMenu: typeof useUnityWorktreeMenu
): (props: HarnessProps) => React.JSX.Element {
  return function Harness(props: HarnessProps): React.JSX.Element {
    const worktree = props.worktree ?? DEFAULT_WORKTREE
    const menu = useMenu({
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
}

export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

/** Reset every spy to its happy path and re-install `window.api.unity`. */
export function resetUnityMenuMocks(): void {
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
}
