// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Repo } from '../../../../shared/repo-types'
import type { WorktreeFolder } from '../../../../shared/worktree-folder/types'
import { useAppStore } from '@/store'
import type { WorktreeFolderRow } from './worktree-list/grouping/row-types'
import { WorktreeFolderRowMenu } from './WorktreeFolderRowMenu'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from './WorktreeContextMenu'

const initialState = useAppStore.getState()

const folderA: WorktreeFolder = {
  id: 'folder-a',
  name: 'Alpha',
  parentFolderId: null,
  createdAt: 1
}
const folderB: WorktreeFolder = { id: 'folder-b', name: 'Beta', parentFolderId: null, createdAt: 2 }

const repo: Repo = {
  id: 'repo1',
  path: '/tmp/repo1',
  displayName: 'repo1',
  badgeColor: '#000000',
  addedAt: 0,
  worktreeFolders: [folderA, folderB]
}

const row: WorktreeFolderRow = {
  type: 'worktree-folder',
  key: 'worktree-folder:local:section:folder-a:0',
  folder: folderA,
  repo,
  hostId: 'local',
  sectionKey: 'section',
  groupDepth: 0,
  folderDepth: 0,
  memberCount: 0,
  collapsed: false
}

describe('WorktreeFolderRowMenu — right-click invocation (styleguide: ContextMenu)', () => {
  beforeEach(() => {
    useAppStore.setState({
      worktreesByRepo: {},
      detectedWorktreesByRepo: {}
    } as never)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
    vi.restoreAllMocks()
  })

  it('opens a real ContextMenu (not a hidden-trigger DropdownMenu) with the folder actions', async () => {
    render(
      <WorktreeFolderRowMenu row={row}>
        <div data-testid="folder-row">Alpha</div>
      </WorktreeFolderRowMenu>
    )

    fireEvent.contextMenu(screen.getByTestId('folder-row'), { clientX: 40, clientY: 60 })

    expect(await screen.findByText('Rename Folder…')).toBeInTheDocument()
    // The styleguide pin: right-click actions ride the ContextMenu primitive.
    expect(document.querySelector('[data-slot="context-menu-content"]')).not.toBeNull()
    expect(document.querySelector('[data-slot="dropdown-menu-content"]')).toBeNull()
    expect(screen.getByText('Move Up')).toBeInTheDocument()
    expect(screen.getByText('Move Down')).toBeInTheDocument()
    expect(screen.getByText('Move to Folder')).toBeInTheDocument()
    expect(screen.getByText('Delete Folder…')).toBeInTheDocument()
  })

  it('broadcasts the close-all event on open so worktree menus cannot stay open beside it', async () => {
    const closeAll = vi.fn()
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeAll)
    try {
      render(
        <WorktreeFolderRowMenu row={row}>
          <div data-testid="folder-row">Alpha</div>
        </WorktreeFolderRowMenu>
      )
      fireEvent.contextMenu(screen.getByTestId('folder-row'))
      await screen.findByText('Rename Folder…')
      expect(closeAll).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeAll)
    }
  })

  it('keeps the E4 delete confirmation behind the destructive item', async () => {
    render(
      <WorktreeFolderRowMenu row={row}>
        <div data-testid="folder-row">Alpha</div>
      </WorktreeFolderRowMenu>
    )
    fireEvent.contextMenu(screen.getByTestId('folder-row'))
    fireEvent.click(await screen.findByText('Delete Folder…'))

    expect(await screen.findByText('No workspace is deleted.')).toBeInTheDocument()
  })
})
