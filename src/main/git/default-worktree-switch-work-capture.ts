import { randomUUID } from 'node:crypto'
import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'
import { gitExecFileAsync } from './runner'

/** Uncommitted work parked for the duration of a default-worktree switch. The
 *  rescue ref keeps `sha` reachable (and named) until the switch succeeds. */
export type CapturedWork = { sha: string; rescueRef: string }

function gitOptions(path: string, options: GitRuntimeOptions) {
  return gitOptionsForWorktree(path, options)
}

async function hasUncommittedChanges(
  path: string,
  options: GitRuntimeOptions,
  includeUntracked: boolean
): Promise<boolean> {
  const result = await gitExecFileAsync(
    ['status', '--porcelain', includeUntracked ? '--untracked-files=all' : '--untracked-files=no'],
    gitOptions(path, options)
  )
  return result.stdout.trim().length > 0
}

const STASH_MESSAGE_PREFIX = 'orca-default-worktree-switch'

type StashEntry = { sha: string; index: number; subject: string }

/** The stash stack is repository-global: every worktree, every terminal and any
 *  second Orca process pushes onto the same ref. Identify entries by SHA rather
 *  than by position so a concurrent push cannot make us drop or adopt one. */
async function listStashEntries(path: string, options: GitRuntimeOptions): Promise<StashEntry[]> {
  const result = await gitExecFileAsync(
    ['stash', 'list', '--format=%H%x1f%gs'],
    gitOptions(path, options)
  )
  return result.stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const [sha = '', subject = ''] = line.split('\u001f')
      return { sha: sha.trim(), index, subject }
    })
}

/** `Dropped stash@{1} (ec8630a…)` — git names what it actually removed, which is
 *  the only way to tell that an index shifted under us. */
function parseDroppedSha(output: string): string | null {
  return /\(([0-9a-f]{7,64})\)/.exec(output)?.[1] ?? null
}

async function storeStashEntry(
  path: string,
  entry: { sha: string; subject: string },
  options: GitRuntimeOptions
): Promise<void> {
  await gitExecFileAsync(
    ['stash', 'store', '--message', entry.subject, entry.sha],
    gitOptions(path, options)
  )
}

const DROP_ATTEMPTS = 3

/**
 * Drop the entry holding `sha` and nothing else.
 *
 * Git has no drop-by-SHA, and positional `stash drop stash@{n}` raced a
 * concurrent push: the index shifted between the lookup and the drop, so the
 * user's own unrelated stash was destroyed with no record of what it had been.
 * `stash drop` does print the SHA it removed, so a wrong hit is detectable —
 * put it straight back and retry. Giving up leaves OUR entry on the stack,
 * which is untidy but costs nobody their work (the rescue ref holds ours).
 */
async function dropStashEntryBySha(
  path: string,
  sha: string,
  options: GitRuntimeOptions
): Promise<void> {
  for (let attempt = 0; attempt < DROP_ATTEMPTS; attempt += 1) {
    const entries = await listStashEntries(path, options)
    const target = entries.find((entry) => entry.sha === sha)
    if (!target) {
      return
    }
    const result = await gitExecFileAsync(
      ['stash', 'drop', `stash@{${target.index}}`],
      gitOptions(path, options)
    )
    const dropped = parseDroppedSha(`${result.stdout}\n${result.stderr}`)
    // Belt and braces: git names what it removed, but the authority on what is
    // actually gone is the stack itself. Restore every entry that vanished and
    // was not ours, whichever of the two noticed it.
    const survivors = new Set((await listStashEntries(path, options)).map((entry) => entry.sha))
    const casualties = entries.filter((entry) => entry.sha !== sha && !survivors.has(entry.sha))
    if (
      dropped !== null &&
      !sha.startsWith(dropped) &&
      !casualties.some((entry) => entry.sha.startsWith(dropped))
    ) {
      casualties.push({ sha: dropped, index: -1, subject: 'restored by orca' })
    }
    for (const casualty of casualties) {
      await storeStashEntry(path, casualty, options)
    }
    if (!survivors.has(sha)) {
      return
    }
  }
}

/**
 * Stash tracked modifications — and untracked files unless the caller opted out
 * — then move the stash off the stack onto a private rescue ref so it survives a
 * crash and cannot collide with the user's own entries. Returns null when there
 * was nothing to capture. Leaves the worktree clean at its branch HEAD either
 * way (modulo files left behind on purpose), ready for a branch switch.
 */
export async function captureUncommittedAsStash(
  path: string,
  options: GitRuntimeOptions,
  includeUntracked: boolean
): Promise<CapturedWork | null> {
  if (!(await hasUncommittedChanges(path, options, includeUntracked))) {
    return null
  }
  // Why a per-capture message: a fixed marker is also what a SECOND Orca process
  // switching the same repo writes, so a no-op push here could adopt that
  // process's entry — rescue-ref it, drop it, and apply its work to this
  // worktree. The uuid makes "ours" mean this call and no other.
  const message = `${STASH_MESSAGE_PREFIX}-${randomUUID()}`
  // Why identify our entry by SHA at all: `stash push` can report success and
  // save NOTHING (e.g. the only change is a dirty submodule whose gitlink is
  // unchanged), and the stack is shared. Trusting stash@{0} then adopted — and
  // dropped — an unrelated entry. Verified against real git.
  const before = new Set((await listStashEntries(path, options)).map((entry) => entry.sha))
  await gitExecFileAsync(
    ['stash', 'push', ...(includeUntracked ? ['--include-untracked'] : []), '--message', message],
    gitOptions(path, options)
  )
  // Deliberately NOT tolerant of a read failure here: treating it as "nothing
  // was captured" would leave the work sitting on the stash stack while the
  // branch swap proceeds and the apply never runs.
  let pushed: StashEntry | undefined
  try {
    pushed = (await listStashEntries(path, options)).find(
      (entry) => !before.has(entry.sha) && entry.subject.includes(message)
    )
  } catch (error) {
    // The work already left the worktree. An error that does not say where it
    // went reads as loss; the stash stack is where it sits.
    throw new Error(
      `default_worktree_switch_capture_unreadable: the captured work is on the stash stack ` +
        `under "${message}" at ${path}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (!pushed) {
    return null
  }
  // Why a real ref instead of a bare SHA: the commit used to survive only as a
  // dangling object whose id lived in a local variable, so any crash between
  // here and the apply left the user's uncommitted work invisible to
  // `git stash list` and reachable only via `git fsck --unreachable`. A ref
  // keeps it off the stash stack (no collision with the user's entries) while
  // remaining discoverable and safe from gc. Deleted only on success.
  const rescueRef = `refs/orca/default-switch/${randomUUID()}`
  await gitExecFileAsync(['update-ref', rescueRef, pushed.sha], gitOptions(path, options))
  try {
    await dropStashEntryBySha(path, pushed.sha, options)
  } catch (error) {
    throw new Error(
      `default_worktree_switch_capture_cleanup_failed: the captured work is preserved at ` +
        `${rescueRef} (and may also remain on the stash stack) at ${path}: ` +
        `${error instanceof Error ? error.message : String(error)}`
    )
  }
  return { sha: pushed.sha, rescueRef }
}

/** Returns false when the ref is still there, so callers can report it rather
 *  than leave a pinned, invisible copy of the user's work behind. */
export async function dropRescueRef(
  path: string,
  rescueRef: string,
  options: GitRuntimeOptions
): Promise<boolean> {
  if (rescueRef.length === 0) {
    return true
  }
  return gitExecFileAsync(['update-ref', '-d', rescueRef], gitOptions(path, options)).then(
    () => true,
    () => false
  )
}

export async function applyStash(
  path: string,
  sha: string,
  options: GitRuntimeOptions
): Promise<void> {
  // Why check cleanliness FIRST: the reset below assumes everything dirty is
  // debris from a failed apply. Between the checkout and this apply a hook or
  // watcher can write real tracked changes, and those are in no rescue ref —
  // resetting them away would be unrecoverable loss.
  const cleanBeforeApply =
    (
      await gitExecFileAsync(
        ['status', '--porcelain', '--untracked-files=no'],
        gitOptions(path, options)
      )
    ).stdout.trim().length === 0
  // --index restores the staged/unstaged split; fall back to a plain apply when
  // git can't reinstate the index cleanly (e.g. a staged path also modified).
  try {
    await gitExecFileAsync(['stash', 'apply', '--index', sha], gitOptions(path, options))
  } catch {
    if (cleanBeforeApply) {
      // The failed apply may have half-landed files and index entries, and a
      // retry ON TOP of that debris conflicted with itself. The tree held
      // nothing but that debris (proved above) and the full content is still
      // held by `sha` — discard and retry clean. `reset --hard` touches only
      // tracked files: kept-in-place untracked and ignored files survive it.
      await gitExecFileAsync(['reset', '--hard'], gitOptions(path, options))
    }
    await gitExecFileAsync(['stash', 'apply', sha], gitOptions(path, options))
  }
}
