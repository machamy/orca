import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'
import { gitExecFileAsync } from './runner'

/** An ignored path at `worktreePath` that `branch` — the branch about to be
 *  checked out there — tracks. */
export type IgnoredCollision = { worktreePath: string; path: string; branch: string }

function gitOptions(path: string, options: GitRuntimeOptions) {
  return gitOptionsForWorktree(path, options)
}

/** Keep one `cat-file` request batch (and its reply) well under the runner's
 *  output cap, so a repo with tens of thousands of scattered ignored files
 *  still gets a complete answer rather than a truncation error. */
const PROBE_BATCH_SIZE = 4096

/**
 * Ignored entries that exist on disk, as git sees them from `path`.
 *
 * `--directory` is what makes this affordable: a wholly-ignored tree comes back
 * as one entry (`Library/`) and git never descends into it. Without it, probing
 * a Unity `Library/` would mean walking millions of files.
 */
async function listIgnoredEntries(
  path: string,
  options: GitRuntimeOptions
): Promise<{ path: string; isDirectory: boolean }[]> {
  const result = await gitExecFileAsync(
    [
      'ls-files',
      '-z',
      '--others',
      '--ignored',
      '--exclude-standard',
      '--directory',
      '--no-empty-directory',
      '--full-name'
    ],
    gitOptions(path, options)
  )
  return result.stdout
    .split('\0')
    .filter((entry) => entry.length > 0)
    .map((entry) =>
      entry.endsWith('/')
        ? { path: entry.slice(0, -1), isDirectory: true }
        : { path: entry, isDirectory: false }
    )
}

/** Spelled out in full so an option-shaped branch name (`--detach`) and git's
 *  ref DWIM can't turn the probe into something else. */
function treeObjectRev(branch: string, entryPath: string): string {
  return `refs/heads/${branch}:${entryPath}`
}

/** True when `rev` names an object in the branch's tree. Anything this cannot
 *  read as a definite "missing" counts as present: over-reporting refuses a
 *  swap, under-reporting destroys the file. */
function revExistsInBatchLine(line: string): boolean {
  return line.length > 0 && !line.endsWith(' missing')
}

async function probeOneByOne(
  path: string,
  revs: string[],
  options: GitRuntimeOptions
): Promise<boolean[]> {
  const present: boolean[] = []
  for (const rev of revs) {
    present.push(
      await gitExecFileAsync(['cat-file', '-e', rev], gitOptions(path, options)).then(
        () => true,
        () => false
      )
    )
  }
  return present
}

/**
 * Which of `revs` exist, in order.
 *
 * `cat-file --batch-check` answers the whole batch in one process and emits
 * exactly one line per request, so the reply is matched back by position. Its
 * request stream is newline-delimited (the `-z` input form postdates the Git
 * 2.25 baseline), so a path containing a newline falls back to one probe each
 * rather than silently shifting every later line.
 */
async function probeRevsExist(
  path: string,
  revs: string[],
  options: GitRuntimeOptions
): Promise<boolean[]> {
  if (revs.some((rev) => rev.includes('\n'))) {
    return probeOneByOne(path, revs, options)
  }
  const present: boolean[] = []
  for (let start = 0; start < revs.length; start += PROBE_BATCH_SIZE) {
    const batch = revs.slice(start, start + PROBE_BATCH_SIZE)
    const result = await gitExecFileAsync(['cat-file', '--batch-check'], {
      ...gitOptions(path, options),
      stdin: `${batch.join('\n')}\n`
    })
    const lines = result.stdout.split('\n').filter((line) => line.length > 0)
    if (lines.length !== batch.length) {
      // The positional match is the only thing tying replies to requests; if it
      // does not hold, guessing would mean guessing about data loss.
      present.push(...(await probeOneByOne(path, batch, options)))
      continue
    }
    present.push(...lines.map(revExistsInBatchLine))
  }
  return present
}

/**
 * Ignored paths at `worktreePath` that `incomingBranch` tracks — the files a
 * checkout would destroy in silence.
 *
 * Git protects untracked files from a checkout but treats ignored ones as
 * disposable and overwrites them without a word, and nothing else in the swap
 * captures them (`stash push -u` saves untracked files only; `--all` would mean
 * copying gigabytes of build output). Detection is therefore the whole defence.
 *
 * Deliberately coarse in two directions, both to keep the cost tied to the
 * (small) ignored-entry list rather than to the repo: a collapsed ignored
 * directory is reported whenever the branch tracks anything under it, even if
 * no individual file would actually be clobbered; and matching is exact, so a
 * case-only difference that a case-folding filesystem would still collide on
 * goes unseen — finding those means listing the branch's whole tree.
 */
export async function findIgnoredPathsTrackedOnBranch(
  worktreePath: string,
  incomingBranch: string,
  options: GitRuntimeOptions
): Promise<string[]> {
  const entries = await listIgnoredEntries(worktreePath, options)
  if (entries.length === 0) {
    return []
  }
  const present = await probeRevsExist(
    worktreePath,
    entries.map((entry) => treeObjectRev(incomingBranch, entry.path)),
    options
  )
  return entries
    .filter((_, index) => present[index])
    .map((entry) => (entry.isDirectory ? `${entry.path}/` : entry.path))
    .sort()
}

const REPORTED_COLLISION_LIMIT = 10

/** Both sides at once: each worktree is checked against the branch arriving
 *  there. Runs before anything is stashed or checked out, so a refusal leaves
 *  the repository exactly as it was. */
export async function findIgnoredCollisions(args: {
  defaultPath: string
  selectedPath: string
  /** Branch arriving at `defaultPath`. */
  promotedBranch: string
  /** Branch arriving at `selectedPath`. */
  demotedBranch: string
  options: GitRuntimeOptions
}): Promise<IgnoredCollision[]> {
  const sides = [
    { worktreePath: args.defaultPath, branch: args.promotedBranch },
    { worktreePath: args.selectedPath, branch: args.demotedBranch }
  ]
  const collisions: IgnoredCollision[] = []
  for (const side of sides) {
    const paths = await findIgnoredPathsTrackedOnBranch(
      side.worktreePath,
      side.branch,
      args.options
    )
    for (const path of paths) {
      collisions.push({ worktreePath: side.worktreePath, path, branch: side.branch })
    }
  }
  return collisions
}

export function describeIgnoredCollisions(collisions: readonly IgnoredCollision[]): string {
  const listed = collisions
    .slice(0, REPORTED_COLLISION_LIMIT)
    .map(
      (collision) => `${collision.worktreePath}: ${collision.path} (tracked on ${collision.branch})`
    )
  const remaining = collisions.length - listed.length
  return [...listed, ...(remaining > 0 ? [`and ${remaining} more`] : [])].join('; ')
}
