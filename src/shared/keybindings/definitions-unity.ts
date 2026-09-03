import type { KeybindingDefinition } from './types'
import { platformBindings } from './definitions-support'

/** Fork-only: the Unity/Rider open shortcuts, kept apart from the upstream core lists so a merge never lands in the middle of them. */
export const KEYBINDING_DEFINITION_UNITY: readonly KeybindingDefinition[] = [
  {
    id: 'unity.openEditor',
    title: 'Open in Unity',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'unity', 'editor', 'open', 'game', 'worktree'],
    // Why: Cmd/Ctrl+Alt, after two rejected chords — Ctrl+Alt+U is Rectangle's
    // top-left-quarter tiling default (it resized windows), and bare Alt+U is a
    // macOS dead key that types ¨ into a terminal. Mod suppresses text input.
    defaultBindings: platformBindings(['Mod+Alt+U']),
    neverInTerminal: true
  },
  {
    id: 'unity.openRider',
    title: 'Open in Rider',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'unity', 'rider', 'jetbrains', 'ide', 'open', 'worktree'],
    // Why: Mod+Alt+R is workspace.rename on macOS, so Rider takes the Shift
    // variant rather than stealing it. darwin-only: findRiderAppPath knows no
    // Rider elsewhere, so a default chord would be consumed just to no-op;
    // users can still bind it manually.
    defaultBindings: {
      darwin: ['Mod+Alt+Shift+R'],
      linux: [],
      win32: []
    },
    neverInTerminal: true
  }
]
