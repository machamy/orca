import { randomUUID } from 'node:crypto'
import { rename, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  encodeClaudeProjectPath,
  encodeClaudeProjectPaths
} from '../../shared/claude-project-path-encoding'

function defaultClaudeProjectsRoot(): string {
  return join(homedir(), '.claude', 'projects')
}

async function existingProjectDir(projectsRoot: string, cwdPath: string): Promise<string | null> {
  for (const name of encodeClaudeProjectPaths(cwdPath)) {
    const candidate = join(projectsRoot, name)
    try {
      if ((await stat(candidate)).isDirectory()) {
        return candidate
      }
    } catch {
      /* not present under this spelling */
    }
  }
  return null
}

/**
 * Claude keys transcripts by cwd (`~/.claude/projects/<encoded-cwd>/`). Follow mode
 * resumes each agent at the OTHER worktree's path, so their transcript dirs must be
 * exchanged too — otherwise `claude --resume` at the new location reports "No
 * conversation found". Safe only while both worktrees' agents are slept.
 */
export async function swapClaudeProjectTranscripts(
  leftCwdPath: string,
  rightCwdPath: string,
  projectsRoot: string = defaultClaudeProjectsRoot()
): Promise<void> {
  // Why refuse: our key derivation normalizes backslashes to '/', but on POSIX a
  // backslash is a legal filename character. `/tmp/a\\b` then keys the same as
  // the unrelated `/tmp/a/b`, and the rename below would hand that project's
  // conversations to this worktree. Leave transcripts alone rather than guess.
  if (process.platform !== 'win32' && (leftCwdPath.includes('\\') || rightCwdPath.includes('\\'))) {
    throw new Error('claude_transcript_swap_ambiguous_path')
  }
  const leftTarget = join(projectsRoot, encodeClaudeProjectPath(leftCwdPath))
  const rightTarget = join(projectsRoot, encodeClaudeProjectPath(rightCwdPath))
  // Why: Claude's encoding folds every non-alphanumeric to '-', so two paths
  // that differ only in non-ASCII characters of the same length (two Hangul
  // worktree names under one parent) share a transcript dir. Both agents
  // already read the same transcripts; the 3-step rename below would then
  // stage that single dir away and fail its second rename, stranding it under
  // a hidden name. Nothing to exchange — leave it alone.
  if (leftTarget === rightTarget) {
    return
  }
  const leftDir = await existingProjectDir(projectsRoot, leftCwdPath)
  const rightDir = await existingProjectDir(projectsRoot, rightCwdPath)
  if (leftDir && rightDir) {
    const stage = join(projectsRoot, `.orca-transcript-swap-${randomUUID()}`)
    await rename(leftDir, stage)
    let movedRightIntoLeft = false
    try {
      await rename(rightDir, leftTarget)
      movedRightIntoLeft = true
      await rename(stage, rightTarget)
    } catch (error) {
      // Undo in reverse. Restoring the stage FIRST cannot work once the right
      // history occupies the left key: rename onto a non-empty directory fails,
      // so the rollback silently did nothing and left the user's left-side
      // history stranded under `.orca-transcript-swap-*` with no key at all.
      const undone = movedRightIntoLeft
        ? await rename(leftTarget, rightDir).then(
            () => true,
            () => false
          )
        : true
      const restored =
        undone &&
        (await rename(stage, leftDir).then(
          () => true,
          () => false
        ))
      if (!restored) {
        throw new Error(
          `claude_transcript_swap_recovery_required: transcripts are staged at ${stage}${
            undone ? '' : `, and ${leftTarget} still holds the other side's history`
          } (${error instanceof Error ? error.message : String(error)})`
        )
      }
      throw error
    }
    return
  }
  if (leftDir) {
    await rename(leftDir, rightTarget)
    return
  }
  if (rightDir) {
    await rename(rightDir, leftTarget)
  }
}
