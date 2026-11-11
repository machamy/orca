import type { HooksConfig } from '../agent-hooks/installation/configuration/hook-config-schema'
import type { ClaudeCompatibleHookSettings } from './hook-settings'
import { installClaudeManagedStatusLine, retireClaudeManagedStatusLine } from './statusline-install'
import {
  installModelBadgeStatusLineWrapper,
  restoreModelBadgeStatusLine
} from './statusline-model-badge-wrapper'

/** Fork: upstream's managed status line, then the model-badge wrapper around whatever the slot holds. */
export function installBadgedStatusLine(
  config: HooksConfig,
  settings: ClaudeCompatibleHookSettings
): HooksConfig {
  const next = installClaudeManagedStatusLine(config, settings)
  return installModelBadgeStatusLineWrapper(next, settings)
}

export function retireBadgedStatusLine(
  config: HooksConfig,
  settings: ClaudeCompatibleHookSettings
): HooksConfig {
  // Unwrap first so upstream still recognizes, and retires, its own entry.
  const unwrapped = restoreModelBadgeStatusLine(config, settings).config
  return retireClaudeManagedStatusLine(unwrapped, settings)
}
