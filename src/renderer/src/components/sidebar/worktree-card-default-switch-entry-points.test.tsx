import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The fork's default-worktree switch has three UI entry points, and all three
 * are props threaded from WorktreeList down through upstream's card modules.
 * Upstream's rewrite of WorktreeCard into a controller silently dropped the last
 * hop: the props still reached the card object, but nothing rendered them, so
 * the context-menu item and the Default badge vanished from the app while every
 * contract round kept passing — the matrix drives the switch over the CLI.
 */
const DIR = join(__dirname)
const read = (name: string): string => readFileSync(join(DIR, name), 'utf-8')

describe('default-worktree switch entry points survive card refactors', () => {
  it('hands the switch request to the context menu', () => {
    expect(read('worktree-card-surface.tsx')).toContain(
      'onDefaultSwitchRequest={onDefaultSwitchRequest}'
    )
  })

  it('renders the drop target the sidebar drag aims at', () => {
    expect(read('worktree-card-surface.tsx')).toContain('data-default-worktree-switch-drop-target')
  })

  it('renders the Default badge on the repo-path row', () => {
    expect(read('worktree-card-meta-row.tsx')).toContain('WorktreeCard.defaultWorktree')
  })

  it('still offers the menu item when a handler is supplied', () => {
    expect(read('WorktreeContextMenu.tsx')).toContain('onDefaultSwitchRequest')
  })
})
