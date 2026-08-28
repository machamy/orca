// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import React, { type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import { worktree as worktreeFixture } from './worktree-list-groups-test-fixtures'

const spies = vi.hoisted(() => ({
  toastError: vi.fn(),
  runWorktreeDelete: vi.fn(),
  createWorktreeFolder: vi.fn(),
  deleteWorktreeFolder: vi.fn(),
  setWorktreeFolderMembership: vi.fn(),
  updateWorktreeLineage: vi.fn(),
  storeState: {} as Record<string, unknown>
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector(spies.storeState),
    { getState: () => spies.storeState }
  )
}))
vi.mock('sonner', () => ({
  toast: { error: spies.toastError, info: vi.fn(), success: vi.fn(), dismiss: vi.fn() }
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    values
      ? fallback.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(values[name] ?? ''))
      : fallback
}))
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
  DropdownMenuSeparator: () => <hr />
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-testid="offer-delete-dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  )
}))
// Mimics the real dialog's contract: close on resolved submit, stay open on throw.
vi.mock('./ProjectGroupNameDialog', () => ({
  ProjectGroupNameDialog: ({
    open,
    onSubmit,
    onOpenChange
  }: {
    open: boolean
    onSubmit: (name: string) => Promise<void> | void
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <button
        data-testid="create-dialog-submit"
        onClick={() => {
          void (async () => {
            try {
              await onSubmit('New Folder')
              onOpenChange(false)
            } catch {
              /* keep the dialog open, like the real dialog */
            }
          })()
        }}
      >
        submit
      </button>
    ) : null
}))
vi.mock('./delete-worktree-flow', () => ({
  runWorktreeDelete: spies.runWorktreeDelete
}))

import { useWorktreeFolderWorktreeMenu } from './worktree-folder-menu'

const localRepo: Repo = {
  id: 'repo1',
  path: '/tmp/repo1',
  displayName: 'repo1',
  badgeColor: '#000000',
  addedAt: 0
}
const sshRepo: Repo = { ...localRepo, executionHostId: 'ssh:beta' }

function makeWorktree(id: string, overrides: Partial<Worktree> = {}): Worktree {
  return {
    ...worktreeFixture,
    id,
    repoId: 'repo1',
    instanceId: `${id}-instance`,
    displayName: id,
    ...overrides
  }
}

function makeLineage(child: Worktree, parent: Worktree): WorktreeLineage {
  return {
    worktreeId: child.id,
    worktreeInstanceId: child.instanceId!,
    parentWorktreeId: parent.id,
    parentWorktreeInstanceId: parent.instanceId!,
    origin: 'cli',
    capture: { source: 'terminal-context', confidence: 'inferred' },
    createdAt: 1
  }
}

const EMPTY_CYCLIC = new Set<string>()

type HarnessProps = {
  worktree: Worktree
  menuOpen?: boolean
  allWorktrees?: readonly Worktree[]
  lineageById?: Readonly<Record<string, WorktreeLineage>>
}

function Harness(props: HarnessProps): React.JSX.Element {
  const menu = useWorktreeFolderWorktreeMenu({
    worktree: props.worktree,
    menuOpen: props.menuOpen ?? true,
    isDeleting: false,
    allWorktrees: props.allWorktrees ?? [props.worktree],
    lineageById: props.lineageById ?? {},
    cyclicLineageIds: EMPTY_CYCLIC
  })
  return (
    <div>
      <div data-testid="items">{menu.menuItems}</div>
      {menu.dialogs}
    </div>
  )
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  spies.createWorktreeFolder.mockResolvedValue({ id: 'folder-a', name: 'New Folder', createdAt: 1 })
  spies.deleteWorktreeFolder.mockResolvedValue(true)
  spies.setWorktreeFolderMembership.mockResolvedValue(true)
  spies.updateWorktreeLineage.mockResolvedValue(undefined)
  Object.assign(spies.storeState, {
    settings: { experimentalWorktreeFolders: true },
    repos: [localRepo],
    createWorktreeFolder: spies.createWorktreeFolder,
    deleteWorktreeFolder: spies.deleteWorktreeFolder,
    setWorktreeFolderMembership: spies.setWorktreeFolderMembership,
    updateWorktreeLineage: spies.updateWorktreeLineage
  })
})

afterEach(() => {
  cleanup()
})

describe('New Folder from Workspace — host-correct repo (defect 6)', () => {
  it("creates on the CLICKED row's host when the same repo id exists on two hosts", async () => {
    spies.storeState.repos = [localRepo, sshRepo]
    const worktree = makeWorktree('repo1::/tmp/worktree-1', { hostId: 'ssh:beta' })
    render(<Harness worktree={worktree} />)

    fireEvent.click(screen.getByText('New Folder from Workspace…'))
    fireEvent.click(screen.getByTestId('create-dialog-submit'))
    await flush()

    expect(spies.createWorktreeFolder).toHaveBeenCalledWith(
      'repo1',
      { name: 'New Folder' },
      { hostId: 'ssh:beta' }
    )
    expect(spies.setWorktreeFolderMembership).toHaveBeenCalledWith([worktree.id], 'folder-a')
  })
})

describe('New Folder from Workspace — lineage child (defect 1)', () => {
  it('un-nests a lineage child before filing, with the need captured at item-select time', async () => {
    const parent = makeWorktree('repo1::/tmp/worktree-parent')
    const child = makeWorktree('repo1::/tmp/worktree-child')
    const lineageById = { [child.id]: makeLineage(child, parent) }
    const view = render(
      <Harness worktree={child} allWorktrees={[parent, child]} lineageById={lineageById} />
    )

    fireEvent.click(screen.getByText('New Folder from Workspace…'))
    // The dialog outlives the menu: the parent empties the lineage inputs on close.
    view.rerender(
      <Harness worktree={child} menuOpen={false} allWorktrees={[parent, child]} lineageById={{}} />
    )
    fireEvent.click(screen.getByTestId('create-dialog-submit'))
    await flush()

    expect(spies.updateWorktreeLineage).toHaveBeenCalledWith(child.id, { noParent: true })
    expect(spies.setWorktreeFolderMembership).toHaveBeenCalledWith([child.id], 'folder-a')
    expect(spies.setWorktreeFolderMembership.mock.invocationCallOrder[0]).toBeGreaterThan(
      spies.updateWorktreeLineage.mock.invocationCallOrder[0]
    )
  })

  it('does not touch lineage for a root row', async () => {
    const worktree = makeWorktree('repo1::/tmp/worktree-1')
    render(<Harness worktree={worktree} />)
    fireEvent.click(screen.getByText('New Folder from Workspace…'))
    fireEvent.click(screen.getByTestId('create-dialog-submit'))
    await flush()
    expect(spies.updateWorktreeLineage).not.toHaveBeenCalled()
    expect(spies.setWorktreeFolderMembership).toHaveBeenCalledWith([worktree.id], 'folder-a')
  })
})

describe('New Folder from Workspace — membership failure (defect 5)', () => {
  it('rolls the empty folder back and keeps the dialog open when filing fails', async () => {
    spies.setWorktreeFolderMembership.mockResolvedValue(false)
    const worktree = makeWorktree('repo1::/tmp/worktree-1')
    render(<Harness worktree={worktree} />)

    fireEvent.click(screen.getByText('New Folder from Workspace…'))
    fireEvent.click(screen.getByTestId('create-dialog-submit'))
    await flush()

    expect(spies.deleteWorktreeFolder).toHaveBeenCalledWith('repo1', 'folder-a', {
      hostId: 'local'
    })
    // The (throwing) submit leaves the dialog open for a retry.
    expect(screen.getByTestId('create-dialog-submit')).toBeInTheDocument()
  })

  it('surfaces an un-nest failure and rolls the folder back', async () => {
    spies.updateWorktreeLineage.mockRejectedValue(new Error('unnest failed'))
    const parent = makeWorktree('repo1::/tmp/worktree-parent')
    const child = makeWorktree('repo1::/tmp/worktree-child')
    render(
      <Harness
        worktree={child}
        allWorktrees={[parent, child]}
        lineageById={{ [child.id]: makeLineage(child, parent) }}
      />
    )

    fireEvent.click(screen.getByText('New Folder from Workspace…'))
    fireEvent.click(screen.getByTestId('create-dialog-submit'))
    await flush()

    expect(spies.toastError).toHaveBeenCalledWith(
      'Failed to move the workspace into the new folder'
    )
    expect(spies.deleteWorktreeFolder).toHaveBeenCalledWith('repo1', 'folder-a', {
      hostId: 'local'
    })
    expect(screen.getByTestId('create-dialog-submit')).toBeInTheDocument()
  })
})

describe('Convert to Folder — partial conversion (defect 2)', () => {
  function renderConvertFixture(): { parent: Worktree; childA: Worktree; childB: Worktree } {
    const parent = makeWorktree('repo1::/tmp/worktree-parent')
    const childA = makeWorktree('repo1::/tmp/worktree-a')
    const childB = makeWorktree('repo1::/tmp/worktree-b')
    render(
      <Harness
        worktree={parent}
        allWorktrees={[parent, childA, childB]}
        lineageById={{
          [childA.id]: makeLineage(childA, parent),
          [childB.id]: makeLineage(childB, parent)
        }}
      />
    )
    return { parent, childA, childB }
  }

  it('never offers deleting the "emptied" worktree when children were left behind', async () => {
    const { childB } = renderConvertFixture()
    spies.updateWorktreeLineage.mockImplementation(async (worktreeId: string) => {
      if (worktreeId === childB.id) {
        throw new Error('unnest failed')
      }
    })

    fireEvent.click(screen.getByText('Convert to Folder…'))
    await flush()

    expect(screen.queryByTestId('offer-delete-dialog')).not.toBeInTheDocument()
    expect(spies.toastError).toHaveBeenCalledWith(
      'Some lineage children could not be moved into the folder'
    )
  })

  it('offers deletion only after a complete conversion', async () => {
    renderConvertFixture()
    fireEvent.click(screen.getByText('Convert to Folder…'))
    await flush()
    expect(screen.getByTestId('offer-delete-dialog')).toBeInTheDocument()
    expect(spies.toastError).not.toHaveBeenCalled()
  })
})
