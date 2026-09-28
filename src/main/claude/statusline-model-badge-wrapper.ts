/**
 * Fork: puts a wrapper in Claude's single statusLine slot so the pane badge gets the
 * live model/effort (claude-statusline-model-badge.ts), then runs whatever command the
 * slot held — the user's own status line, or Orca's rate-limit feed — so the terminal
 * shows exactly what it showed before. The replaced command stays in the slot as the
 * fallback half of the wrapper command, so the status line survives a machine without
 * Orca, and goes back on its own when Orca's hooks are uninstalled.
 *
 * POSIX only: Windows keeps upstream's behavior (no wrapper, badge falls back to hooks).
 */

import { rmSync, writeFileSync } from 'node:fs'
import { CLAUDE_STATUSLINE_MODEL_PATHNAME } from '../../shared/claude-statusline-model-badge'
import { getSharedManagedScriptPath, writeManagedScript } from '../agent-hooks/installer-utils'
import type { HooksConfig } from '../agent-hooks/installer-utils'
import { CLAUDE_HOOK_SETTINGS, getStatusLineScriptBaseName } from './hook-settings'

export type WrapperPaths = { script: string; inner: string }

// Why this name: it must not match upstream's managed-statusline matcher
// (`agent-hooks/claude-statusline.sh`), or upstream would treat the wrapper as its own.
function wrapperBaseName(settings = CLAUDE_HOOK_SETTINGS): string {
  return getStatusLineScriptBaseName(settings).replace(/-statusline$/, '-model-badge-statusline')
}

export function getModelBadgeWrapperPaths(settings = CLAUDE_HOOK_SETTINGS): WrapperPaths {
  const base = wrapperBaseName(settings)
  return {
    script: getSharedManagedScriptPath(`${base}.sh`),
    inner: getSharedManagedScriptPath(`${base}.inner`)
  }
}

// Why `${HOME-}`: like upstream's managed entries (STA-3348), the settings file stays valid
// when it moves to another profile. The trailing original command is the fallback that
// keeps the status line alive where the wrapper script does not exist.
export function getModelBadgeWrapperCommandPrefix(settings = CLAUDE_HOOK_SETTINGS): string {
  const script = `"\${HOME-}/.orca/agent-hooks/${wrapperBaseName(settings)}.sh"`
  return `if [ -r ${script} ]; then exec /bin/sh ${script}; fi; `
}

export function getModelBadgeWrapperCommand(
  originalCommand: string,
  settings = CLAUDE_HOOK_SETTINGS
): string {
  return `${getModelBadgeWrapperCommandPrefix(settings)}${originalCommand}`
}

function wrappedOriginal(command: string, settings = CLAUDE_HOOK_SETTINGS): string | null {
  const prefix = getModelBadgeWrapperCommandPrefix(settings)
  return command.startsWith(prefix) ? command.slice(prefix.length) : null
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

// Extracts one JSON string value after `key` with builtins only: this runs on every
// statusline refresh, several times a second while Claude streams.
function jsonStringAfter(variable: string, key: string): string[] {
  return [
    `  ${variable}=\${${variable}#*'"${key}"'}`,
    `  ${variable}=\${${variable}#*:}`,
    `  ${variable}=\${${variable}#*'"'}`,
    `  ${variable}=\${${variable}%%'"'*}`
  ]
}

export function getModelBadgeWrapperScript(innerPath: string): string {
  return [
    '#!/bin/sh',
    '# Orca: forwards the statusline model/effort to the pane badge, then runs the',
    '# statusline command this replaced (kept in the .inner file next to this script).',
    `orca_badge_inner_file=${shellSingleQuote(innerPath)}`,
    'payload=',
    'while IFS= read -r orca_badge_line || [ -n "$orca_badge_line" ]; do',
    '  payload="${payload}${orca_badge_line}',
    '"',
    'done',
    // Why: the loop ends every line with a newline, including the last; drop that one.
    'payload=${payload%?}',
    // Why skip workers: a backgrounded session inherits the dispatching pane's key (#9236).
    'if [ -z "$CLAUDE_JOB_DIR" ] && [ -n "$ORCA_PANE_KEY" ] && [ -n "$payload" ]; then',
    '  orca_badge_model=',
    '  orca_badge_effort=',
    '  case "$payload" in *\'"model"\'*)',
    '    orca_badge_model=${payload#*\'"model"\'}',
    "    orca_badge_model=${orca_badge_model%%'}'*}",
    '    case "$orca_badge_model" in',
    '      *\'"display_name"\'*)',
    ...jsonStringAfter('orca_badge_model', 'display_name').map((line) => `    ${line}`),
    '        ;;',
    '      *\'"id"\'*)',
    ...jsonStringAfter('orca_badge_model', 'id').map((line) => `    ${line}`),
    '        ;;',
    '      *) orca_badge_model= ;;',
    '    esac',
    '    ;;',
    '  esac',
    '  case "$payload" in *\'"effort"\'*)',
    '    orca_badge_effort=${payload#*\'"effort"\'}',
    "    orca_badge_effort=${orca_badge_effort%%'}'*}",
    '    case "$orca_badge_effort" in',
    '      *\'"level"\'*)',
    ...jsonStringAfter('orca_badge_effort', 'level').map((line) => `    ${line}`),
    '        ;;',
    '      *) orca_badge_effort= ;;',
    '    esac',
    '    ;;',
    '  esac',
    '  if [ -n "$orca_badge_model$orca_badge_effort" ]; then',
    '    if [ -n "$ORCA_AGENT_HOOK_ENDPOINT" ] && [ -r "$ORCA_AGENT_HOOK_ENDPOINT" ]; then',
    '      . "$ORCA_AGENT_HOOK_ENDPOINT" 2>/dev/null || :',
    '    fi',
    '    if [ -n "$ORCA_AGENT_HOOK_PORT" ] && [ -n "$ORCA_AGENT_HOOK_TOKEN" ]; then',
    '      orca_badge_pane_id=${ORCA_PANE_KEY##*:}',
    '      case "$orca_badge_pane_id" in \'\'|*[!A-Za-z0-9._-]*) orca_badge_pane_id=pane ;; esac',
    '      orca_badge_stamp="${TMPDIR:-/tmp}/orca-model-badge-${orca_badge_pane_id}"',
    // Why the port: it changes on every Orca start, so a restarted Orca (with an empty
    // badge cache) gets the current value again without a model change.
    '      orca_badge_sig="${ORCA_AGENT_HOOK_PORT}|${orca_badge_model}|${orca_badge_effort}"',
    '      orca_badge_last=',
    '      if [ -f "$orca_badge_stamp" ]; then',
    '        IFS= read -r orca_badge_last <"$orca_badge_stamp" 2>/dev/null || :',
    '      fi',
    '      if [ "$orca_badge_sig" != "$orca_badge_last" ]; then',
    '        printf \'%s\\n\' "$orca_badge_sig" >"$orca_badge_stamp" 2>/dev/null || :',
    `        ( curl -sS -X POST "http://127.0.0.1:\${ORCA_AGENT_HOOK_PORT}${CLAUDE_STATUSLINE_MODEL_PATHNAME}" \\`,
    '          --connect-timeout 0.5 --max-time 1.5 \\',
    '          -H "Content-Type: application/x-www-form-urlencoded" \\',
    '          -H "X-Orca-Agent-Hook-Token: ${ORCA_AGENT_HOOK_TOKEN}" \\',
    '          --data-urlencode "paneKey=${ORCA_PANE_KEY}" \\',
    '          --data-urlencode "model=${orca_badge_model}" \\',
    '          --data-urlencode "effort=${orca_badge_effort}" >/dev/null 2>&1 & )',
    '      fi',
    '    fi',
    '  fi',
    'fi',
    'if [ -r "$orca_badge_inner_file" ]; then',
    '  orca_badge_inner=',
    '  while IFS= read -r orca_badge_line || [ -n "$orca_badge_line" ]; do',
    '    orca_badge_inner="${orca_badge_inner}${orca_badge_line}',
    '"',
    '  done <"$orca_badge_inner_file"',
    '  if [ -n "$orca_badge_inner" ]; then',
    '    printf \'%s\' "$payload" | /bin/sh -c "$orca_badge_inner"',
    '    exit $?',
    '  fi',
    'fi',
    'exit 0',
    ''
  ].join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function currentStatusLine(config: HooksConfig): Record<string, unknown> | null {
  const slot = config.statusLine
  return isRecord(slot) && typeof slot.command === 'string' ? slot : null
}

/**
 * Wraps whatever the statusLine slot holds. An empty slot is left empty: upstream only
 * leaves it empty when the user deleted Orca's entry, which is an opt-out to respect.
 */
export function installModelBadgeStatusLineWrapper(
  config: HooksConfig,
  settings = CLAUDE_HOOK_SETTINGS,
  paths: WrapperPaths = getModelBadgeWrapperPaths(settings)
): HooksConfig {
  if (process.platform === 'win32') {
    return config
  }
  const slot = currentStatusLine(config)
  if (!slot || typeof slot.command !== 'string') {
    return config
  }
  const original = wrappedOriginal(slot.command, settings) ?? slot.command
  // Script first: writing it creates the agent-hooks directory the sidecar lives in.
  writeManagedScript(paths.script, getModelBadgeWrapperScript(paths.inner))
  writeFileSync(paths.inner, `${original}\n`, { mode: 0o600 })
  return {
    ...config,
    statusLine: { ...slot, command: getModelBadgeWrapperCommand(original, settings) }
  }
}

/** Puts the wrapped command back into the slot; call before upstream removes its own. */
export function restoreModelBadgeStatusLine(
  config: HooksConfig,
  settings = CLAUDE_HOOK_SETTINGS,
  paths: WrapperPaths = getModelBadgeWrapperPaths(settings)
): { config: HooksConfig; changed: boolean } {
  const slot = currentStatusLine(config)
  const original =
    slot && typeof slot.command === 'string' ? wrappedOriginal(slot.command, settings) : null
  if (!slot || original === null) {
    return { config, changed: false }
  }
  const next = { ...config }
  if (original.trim()) {
    next.statusLine = { ...slot, command: original }
  } else {
    delete next.statusLine
  }
  rmSync(paths.inner, { force: true })
  rmSync(paths.script, { force: true })
  return { config: next, changed: true }
}
