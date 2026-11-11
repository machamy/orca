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
    expect(read('workspace-card/surface/worktree-card-surface.tsx')).toContain(
      'onDefaultSwitchRequest={onDefaultSwitchRequest}'
    )
  })

  it('renders the drop target the sidebar drag aims at', () => {
    expect(read('workspace-card/surface/worktree-card-surface.tsx')).toContain(
      '<WorktreeCardDefaultSwitchDropZone'
    )
    expect(read('workspace-card/surface/worktree-card-default-switch-drop-zone.tsx')).toContain(
      'data-default-worktree-switch-drop-target'
    )
  })

  // Upstream now draws cards from a JSON template, so the badge must be a template element.
  it('renders the Default badge on the repo-path row', () => {
    expect(read('workspace-card/template/default-workspace-card.json')).toContain(
      '{ "el": "DefaultBadge", "when": "ws.isDefaultWorktree" }'
    )
    expect(read('workspace-card/template/card-identity-parts.tsx')).toContain(
      'DefaultBadge: part([], () => <WorktreeCardDefaultBadge />)'
    )
    expect(read('workspace-card/metadata/worktree-card-default-badge.tsx')).toContain(
      'WorktreeCard.defaultWorktree'
    )
  })

  // Upstream split WorktreeContextMenu.tsx into a model hook and a view; the menu
  // item and its handler moved with them, so the check follows them there.
  it('still offers the menu item when a handler is supplied', () => {
    expect(read('workspace-actions/context-menu/use-worktree-context-menu-model.tsx')).toContain(
      'onDefaultSwitchRequest?.(worktree)'
    )
    expect(read('workspace-actions/context-menu/WorktreeContextMenuView.tsx')).toContain(
      '<DefaultWorktreeSwitchMenuItem model={model}'
    )
    expect(read('DefaultWorktreeSwitchMenuItem.tsx')).toContain(
      'if (!model.onDefaultSwitchRequest)'
    )
    expect(read('DefaultWorktreeSwitchMenuItem.tsx')).toContain(
      'onSelect={model.handleDefaultSwitch}'
    )
  })
})
