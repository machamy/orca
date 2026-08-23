// @vitest-environment happy-dom

import React, { type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Repo } from '../../../../../../shared/repo-types'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
const { updateRepo, setUnityTintSidebarPreview } = vi.hoisted(() => ({
  updateRepo: vi.fn(),
  setUnityTintSidebarPreview: vi.fn()
}))
vi.mock('@/store', () => {
  const state = { updateRepo, setUnityTintSidebarPreview }
  return {
    useAppStore: Object.assign((selector: (s: unknown) => unknown) => selector(state), {
      getState: () => state
    })
  }
})
vi.mock('@/components/settings/repository-settings-targets', () => ({
  getRepositoryIconSectionId: () => 'icon'
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>
}))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
// Radix submenus need a real pointer stack to open; this stand-in keeps the
// radio wiring (value, hover, selection) observable without one.
vi.mock('@/components/ui/dropdown-menu', async () => {
  const R = await import('react')
  const RadioContext = R.createContext<{
    value?: string
    onValueChange?: (value: string) => void
  }>({})
  const Passthrough = ({ children }: { children?: ReactNode }): React.JSX.Element => (
    <div>{children}</div>
  )
  return {
    DropdownMenu: Passthrough,
    DropdownMenuTrigger: Passthrough,
    DropdownMenuContent: Passthrough,
    DropdownMenuItem: Passthrough,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuCheckboxItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DropdownMenuSub: ({
      children,
      onOpenChange
    }: {
      children?: ReactNode
      onOpenChange?: (open: boolean) => void
    }) => (
      <div data-testid="sub">
        <button type="button" data-testid="sub-close" onClick={() => onOpenChange?.(false)} />
        {children}
      </div>
    ),
    DropdownMenuSubTrigger: ({ children }: { children?: ReactNode }) => (
      <div data-testid="sub-trigger">{children}</div>
    ),
    DropdownMenuSubContent: ({
      children,
      onPointerLeave
    }: {
      children?: ReactNode
      onPointerLeave?: () => void
    }) => (
      <div data-testid="sub-content" onPointerLeave={onPointerLeave}>
        {children}
      </div>
    ),
    DropdownMenuRadioGroup: ({
      value,
      onValueChange,
      children
    }: {
      value?: string
      onValueChange?: (value: string) => void
      children?: ReactNode
    }) => {
      const selection = R.useMemo(() => ({ value, onValueChange }), [value, onValueChange])
      return <RadioContext.Provider value={selection}>{children}</RadioContext.Provider>
    },
    DropdownMenuRadioItem: ({
      value,
      children,
      onPointerEnter,
      onFocus
    }: {
      value: string
      children?: ReactNode
      onPointerEnter?: () => void
      onFocus?: () => void
    }) => {
      const ctx = R.useContext(RadioContext)
      return (
        <button
          type="button"
          role="menuitemradio"
          aria-checked={ctx.value === value}
          onClick={() => ctx.onValueChange?.(value)}
          onPointerEnter={onPointerEnter}
          onFocus={onFocus}
        >
          {children}
        </button>
      )
    }
  }
})

import { RepoHeaderProjectActionsMenu } from './repo-header-project-actions'

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

const ACTIONS = {
  getWorktreeVisibilityDefaults: () => undefined,
  onOpenRepoSettings: vi.fn(),
  onOpenWorktreeVisibility: vi.fn(),
  onCreateGroupFromRepo: vi.fn(),
  onMoveProjectToGroup: vi.fn(),
  onRemoveProjectFromGroup: vi.fn(),
  onRemoveProject: vi.fn(),
  onCreateForRepo: vi.fn()
}

function renderMenu(repo: Repo): void {
  render(
    <RepoHeaderProjectActionsMenu repo={repo} label="R" projectGroups={[]} actions={ACTIONS} />
  )
}

function checkedModeLabel(): string | null {
  const checked = screen
    .getAllByRole('menuitemradio')
    .filter((item) => item.getAttribute('aria-checked') === 'true')
  expect(checked).toHaveLength(1)
  return checked[0].textContent
}

beforeEach(() => {
  updateRepo.mockReset()
  setUnityTintSidebarPreview.mockReset()
})
afterEach(() => cleanup())

describe('Unity project settings visibility', () => {
  it.each([
    ['a folder workspace', { kind: 'folder' as Repo['kind'] }],
    ['an SSH repo', { connectionId: 'ssh-1' }],
    ['a runtime-hosted repo', { executionHostId: 'runtime:remote-1' as Repo['executionHostId'] }]
  ])('offers no Unity settings for %s', (_name, overrides) => {
    renderMenu(makeRepo(overrides))
    expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0)
    expect(screen.queryByText('Unity colour in the sidebar')).toBeNull()
    expect(screen.queryByText('Colour each Unity worktree differently')).toBeNull()
  })

  it('offers them for a plain local git repo', () => {
    renderMenu(makeRepo())
    expect(screen.getByText('Unity colour in the sidebar')).toBeTruthy()
  })
})

describe('Unity sidebar tint mode menu', () => {
  it('offers the four modes in order', () => {
    renderMenu(makeRepo())
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'Off',
      'Left colour bar',
      'Row background tint',
      'Right colour chip'
    ])
  })

  it('checks the left bar when the repo has never chosen', () => {
    renderMenu(makeRepo())
    expect(checkedModeLabel()).toBe('Left colour bar')
  })

  it('checks off for a repo that opted out explicitly', () => {
    renderMenu(makeRepo({ unityTintInSidebar: 'off' }))
    expect(checkedModeLabel()).toBe('Off')
  })

  it('checks the left bar for a repo saved before the four-way choice', () => {
    renderMenu(makeRepo({ unityTintInSidebar: true as unknown as Repo['unityTintInSidebar'] }))
    expect(checkedModeLabel()).toBe('Left colour bar')
  })

  it('writes the picked mode and drops the preview', () => {
    renderMenu(makeRepo({ unityTintInSidebar: 'bar' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Row background tint' }))
    expect(updateRepo).toHaveBeenCalledWith('r1', { unityTintInSidebar: 'wash' })
    expect(setUnityTintSidebarPreview).toHaveBeenLastCalledWith('r1', null)
  })

  it('previews on hover and on keyboard focus', () => {
    renderMenu(makeRepo())
    fireEvent.pointerEnter(screen.getByRole('menuitemradio', { name: 'Right colour chip' }))
    expect(setUnityTintSidebarPreview).toHaveBeenLastCalledWith('r1', 'chip')
    fireEvent.focus(screen.getByRole('menuitemradio', { name: 'Left colour bar' }))
    expect(setUnityTintSidebarPreview).toHaveBeenLastCalledWith('r1', 'bar')
  })

  it('drops the preview when the pointer leaves and when the submenu closes', () => {
    renderMenu(makeRepo())
    fireEvent.pointerEnter(screen.getByRole('menuitemradio', { name: 'Off' }))
    fireEvent.pointerLeave(screen.getByTestId('sub-content'))
    expect(setUnityTintSidebarPreview).toHaveBeenLastCalledWith('r1', null)
    setUnityTintSidebarPreview.mockClear()
    fireEvent.click(screen.getByTestId('sub-close'))
    expect(setUnityTintSidebarPreview).toHaveBeenCalledWith('r1', null)
  })

  it('drops the preview when the menu unmounts', () => {
    renderMenu(makeRepo())
    fireEvent.pointerEnter(screen.getByRole('menuitemradio', { name: 'Off' }))
    setUnityTintSidebarPreview.mockClear()
    cleanup()
    expect(setUnityTintSidebarPreview).toHaveBeenCalledWith('r1', null)
  })

  it('stays out of folder workspaces and remote repos', () => {
    renderMenu(makeRepo({ kind: 'folder' }))
    expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0)
    cleanup()
    renderMenu(makeRepo({ connectionId: 'ssh:host' }))
    expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0)
  })
})
