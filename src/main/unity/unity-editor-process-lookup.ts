import {
  isWindowsAbsolutePathLike,
  normalizeRuntimePathForComparison
} from '../../shared/cross-platform-path'
import { getCommandTokenPathBasename } from '../../shared/command-token-scanner'
import { getFreshProcessTableSnapshot } from '../../shared/process-table-snapshot-reader'
import { readWindowsProcessTableFresh } from '../windows/windows-process-table'

/**
 * Which Unity EDITOR process (if any) already has a project open.
 *
 * Deliberately not `editorIsRunningOn` (unity-project-worktree.ts): that gate
 * answers "is anything Unity touching this project", and must keep matching the
 * `-batchMode` AssetImportWorker children, because a worker mid-import is
 * exactly the state a Library clone must not copy out of. Raising a window is
 * the opposite question — a worker has no window — so this one selects the
 * editor alone and carries the pid, which the failure popup has to name.
 */
export type UnityEditorProcess = { pid: number; command: string }

/** The subset of a process-table row this lookup needs. */
export type UnityProcessRow = { pid: number; command: string }

const PROJECT_PATH_FLAG = '-projectpath'
const BATCH_MODE_FLAG = '-batchmode'
const POSIX_EDITOR_BINARY = 'Unity'
const WINDOWS_EDITOR_BINARY = 'unity.exe'
// Unity names its import workers; the flag catches them, this catches a worker
// spawned without it.
const IMPORT_WORKER_PREFIX = 'assetimportworker'

function isSpace(character: string | undefined): boolean {
  return character === undefined || /\s/.test(character)
}

/**
 * Only the editor binary itself owns a window. Unity Hub keeps `-projectPath`
 * on its own command line after launching a project, and the editor's helpers
 * (`UnityShaderCompiler`, `Unity.Licensing.Client`, ...) all live under
 * `Unity.app`, so "contains unity" is not an editor test. Case follows the
 * path's syntax, as in `comparePathCandidate`.
 */
function isUnityEditorBinary(command: string): boolean {
  const executable = executablePath(command)
  const binary = getCommandTokenPathBasename(executable)
  return isWindowsAbsolutePathLike(executable)
    ? binary.toLowerCase() === WINDOWS_EDITOR_BINARY
    : binary === POSIX_EDITOR_BINARY
}

/**
 * The argv[0] of a command line, read with the same rules as a `-projectPath`
 * value: a quoted head is the executable; an unquoted one (`ps` never quotes,
 * and `/Applications/Unity Hub.app/.../Unity Hub` holds spaces) runs up to
 * the first `-`-led token.
 */
function executablePath(command: string): string {
  const head = command.trimStart()
  return (
    quotedArgumentValue(head) ??
    head.slice(0, unquotedCandidateEnds(head)[0] ?? head.length).trimEnd()
  )
}

function isHeadlessUnityProcess(command: string): boolean {
  for (const token of command.split(/\s+/)) {
    const lowered = token.toLowerCase()
    if (lowered === BATCH_MODE_FLAG || lowered.startsWith(IMPORT_WORKER_PREFIX)) {
      return true
    }
  }
  return false
}

/** Every `-projectPath <value>` argument, kept as the untrimmed tail so a path
 *  containing spaces can still be matched whole. */
function projectPathArguments(command: string): string[] {
  const lowered = command.toLowerCase()
  const values: string[] = []
  let from = 0
  for (;;) {
    const at = lowered.indexOf(PROJECT_PATH_FLAG, from)
    if (at === -1) {
      return values
    }
    from = at + PROJECT_PATH_FLAG.length
    if (!isSpace(at === 0 ? undefined : command[at - 1]) || !isSpace(command[from])) {
      continue
    }
    let cursor = from
    while (cursor < command.length && isSpace(command[cursor])) {
      cursor += 1
    }
    if (cursor < command.length) {
      values.push(command.slice(cursor))
    }
  }
}

/**
 * 0 = byte-exact, 1 = canonical-key match (Windows-syntax paths fold case and
 * separators; POSIX paths stay case-sensitive), null = different paths. Case
 * semantics come from the path's own syntax, never from the client platform —
 * same rule as `normalizeRuntimePathForComparison`.
 */
function comparePathCandidate(candidate: string, projectPath: string): 0 | 1 | null {
  if (candidate === projectPath) {
    return 0
  }
  return normalizeRuntimePathForComparison(candidate) ===
    normalizeRuntimePathForComparison(projectPath)
    ? 1
    : null
}

/**
 * Ends of every plausible path candidate in an unquoted argument tail. `ps`
 * does not quote, so `-projectPath /w/my project -logFile` must not read as
 * `/w/my`; every remaining Unity argument is flag-led, so a candidate ends
 * where a `-`-led token begins (or the argument ends).
 */
function unquotedCandidateEnds(argument: string): number[] {
  const ends: number[] = []
  for (let index = 0; index < argument.length; index += 1) {
    if (!isSpace(argument[index])) {
      continue
    }
    let cursor = index
    while (cursor < argument.length && isSpace(argument[cursor])) {
      cursor += 1
    }
    if (argument[cursor] === '-') {
      ends.push(index)
    }
    index = cursor - 1
  }
  ends.push(argument.length)
  return ends
}

/** The quoted value heading an argument, or null when it is unquoted. */
function quotedArgumentValue(argument: string): string | null {
  const quote = argument[0]
  if (quote !== '"' && quote !== "'") {
    return null
  }
  const end = argument.indexOf(quote, 1)
  return end === -1 ? argument.slice(1) : argument.slice(1, end)
}

function argumentMatchRank(argument: string, projectPath: string): 0 | 1 | null {
  const quoted = quotedArgumentValue(argument)
  if (quoted !== null) {
    return comparePathCandidate(quoted, projectPath)
  }
  let best: 0 | 1 | null = null
  for (const end of unquotedCandidateEnds(argument)) {
    const rank = comparePathCandidate(argument.slice(0, end).trimEnd(), projectPath)
    if (rank === 0) {
      return 0
    }
    best = best ?? rank
  }
  return best
}

function projectMatchRank(command: string, projectPath: string): 0 | 1 | null {
  let best: 0 | 1 | null = null
  for (const argument of projectPathArguments(command)) {
    const rank = argumentMatchRank(argument, projectPath)
    if (rank === 0) {
      return 0
    }
    best = best ?? rank
  }
  return best
}

export function selectUnityEditorProcesses(
  rows: readonly UnityProcessRow[],
  projectPath: string
): UnityEditorProcess[] {
  // Exact outranks canonical: on case-sensitive APFS two projects can differ only
  // by case, and the exact launch arg tells them apart.
  return rows
    .map((row) => ({
      row,
      rank:
        Number.isInteger(row.pid) &&
        row.pid > 0 &&
        isUnityEditorBinary(row.command) &&
        !isHeadlessUnityProcess(row.command)
          ? projectMatchRank(row.command, projectPath)
          : null
    }))
    .filter((entry): entry is { row: UnityProcessRow; rank: 0 | 1 } => entry.rank !== null)
    .sort((left, right) => left.rank - right.rank)
    .map(({ row }) => ({ pid: row.pid, command: row.command }))
}

/** Both readers are the shared, deduped, timeout-bounded ones (with the Windows
 *  wmic fallback). FRESH on purpose: the cached POSIX snapshot has a 500ms TTL,
 *  and an editor Orca itself started moments ago must not be missed because a
 *  scan from just before that launch is still inside its window. */
async function defaultProcessRows(platform: NodeJS.Platform): Promise<UnityProcessRow[]> {
  if (platform === 'win32') {
    // Why fall back to the image name: a process that denied a query handle has no command line.
    return (await readWindowsProcessTableFresh()).map((row) => ({
      pid: row.pid,
      command: row.command || row.name
    }))
  }
  return getFreshProcessTableSnapshot()
}

/**
 * The editor already holding this project, or null. Never throws: an
 * unreadable process table simply means "we cannot tell", and the caller then
 * launches as it always did rather than failing the user's click.
 */
export async function findUnityEditorProcess(args: {
  projectPath: string
  platform?: NodeJS.Platform
  listProcesses?: () => Promise<readonly UnityProcessRow[]>
}): Promise<UnityEditorProcess | null> {
  const platform = args.platform ?? process.platform
  try {
    const rows = await (args.listProcesses ?? (() => defaultProcessRows(platform)))()
    return selectUnityEditorProcesses(rows, args.projectPath)[0] ?? null
  } catch {
    return null
  }
}
