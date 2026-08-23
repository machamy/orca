import { normalizeRuntimePathSeparators } from './cross-platform-path'

/** Claude stores transcripts under `~/.claude/projects/<encoded-cwd>/`, where the
 *  dir name is the raw cwd with every non-alphanumeric replaced by `-`. */
export function encodeClaudeProjectPath(pathValue: string): string {
  const separated = normalizeRuntimePathSeparators(pathValue)
  const trimmed =
    separated === '/' || /^[A-Za-z]:\/$/.test(separated) ? separated : separated.replace(/\/+$/, '')
  return trimmed.replace(/[^a-zA-Z0-9]/g, '-')
}

/**
 * Why: Claude derives the directory name from the raw cwd, so encoding from the
 * comparison key would lowercase Windows paths and never match on disk. Encode
 * the raw path, plus its NFC spelling, since macOS hands us NFD (#10832).
 */
export function encodeClaudeProjectPaths(pathValue: string): string[] {
  const raw = encodeClaudeProjectPath(pathValue)
  const composed = encodeClaudeProjectPath(pathValue.normalize('NFC'))
  return raw === composed ? [raw] : [raw, composed]
}
