// @vitest-environment happy-dom

// Fork contract: a folder row's Enter/Space toggle must stay inside the row —
// the viewport container's own Enter handler moves focus into the xterm helper
// textarea, which would kill sidebar keyboard interaction after one toggle.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VirtualItem } from '@tanstack/react-virtual'
import type { WorktreeFolderRow } from '../grouping/row-types'
import { renderWorktreeFolderVirtualRow } from './worktree-folder-row'

function folderRowFixture(): WorktreeFolderRow {
  return {
    type: 'worktree-folder',
    key: 'worktree-folder:local:repo-1:folder-1:0',
    folder: { id: 'folder-1', name: 'experiments' },
    repo: { id: 'repo-1' },
    hostId: 'local',
    sectionKey: 'repo-1',
    groupDepth: 0,
    folderDepth: 0,
    collapsed: false,
    memberCount: 2
  } as unknown as WorktreeFolderRow
}

const vItemFixture = { key: 'row-1', index: 0, start: 0, size: 28 } as unknown as VirtualItem

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
})

async function pressKeyOnFolderRow(key: string): Promise<{
  onToggle: ReturnType<typeof vi.fn>
  containerKeyDown: ReturnType<typeof vi.fn>
}> {
  const onToggle = vi.fn()
  const containerKeyDown = vi.fn()
  await act(async () => {
    root.render(
      <div onKeyDown={containerKeyDown}>
        {renderWorktreeFolderVirtualRow({
          row: folderRowFixture(),
          vItem: vItemFixture,
          groupBy: 'none',
          measureVirtualRowElement: () => {},
          onToggle
        })}
      </div>
    )
  })
  const rowButton = container.querySelector<HTMLElement>('[data-worktree-folder-row]')
  expect(rowButton).not.toBeNull()
  await act(async () => {
    rowButton!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
  return { onToggle, containerKeyDown }
}

describe('worktree folder row keyboard toggle', () => {
  it('Enter toggles the folder without reaching the container handler', async () => {
    const { onToggle, containerKeyDown } = await pressKeyOnFolderRow('Enter')
    expect(onToggle).toHaveBeenCalledTimes(1)
    // The leak: the viewport's Enter handler steals focus into xterm.
    expect(containerKeyDown).not.toHaveBeenCalled()
  })

  it('Space toggles the folder without reaching the container handler', async () => {
    const { onToggle, containerKeyDown } = await pressKeyOnFolderRow(' ')
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(containerKeyDown).not.toHaveBeenCalled()
  })

  it('lets unhandled keys bubble to the container untouched', async () => {
    const { onToggle, containerKeyDown } = await pressKeyOnFolderRow('ArrowDown')
    expect(onToggle).not.toHaveBeenCalled()
    expect(containerKeyDown).toHaveBeenCalledTimes(1)
  })
})
