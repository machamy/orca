import { keybindingMatchesAction } from '../../../shared/keybindings/matching'
import type {
  KeybindingInput,
  KeybindingMatchOptions,
  KeybindingOverrides
} from '../../../shared/keybindings/types'

/** Which editor a keypress asks for, or null when it asks for neither. */
export type UnityEditorShortcut = 'unity' | 'rider'

export function matchUnityEditorShortcut(
  input: KeybindingInput,
  platform: NodeJS.Platform,
  keybindings?: KeybindingOverrides,
  options?: KeybindingMatchOptions
): UnityEditorShortcut | null {
  if (keybindingMatchesAction('unity.openEditor', input, platform, keybindings, options)) {
    return 'unity'
  }
  if (keybindingMatchesAction('unity.openRider', input, platform, keybindings, options)) {
    return 'rider'
  }
  return null
}
