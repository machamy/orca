import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as FsPromisesModule from 'node:fs/promises'
import { encodeClaudeProjectPath } from '../../shared/claude-project-path-encoding'

type FsPromises = typeof FsPromisesModule

// Only way to exercise the rollback: make the LAST of the three renames fail
// while the first two really happen, so the assertions see the real on-disk
// state the recovery has to repair.
let failRenameOnCall: number | null = null
let renameCalls = 0
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<FsPromises>()
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      renameCalls += 1
      if (failRenameOnCall !== null && renameCalls === failRenameOnCall) {
        throw new Error('rename failed')
      }
      return actual.rename(from, to)
    }
  }
})

beforeEach(() => {
  failRenameOnCall = null
  renameCalls = 0
})
import { swapClaudeProjectTranscripts } from './claude-project-transcript-swap'

function makeProjectsRoot(): string {
  return mkdtempSync(join(tmpdir(), 'claude-projects-'))
}

const DEFAULT_PATH = '/repo'
const FEATURE_PATH = '/repo/workspaces/feature'
const DEFAULT_DIR = '-repo'
const FEATURE_DIR = '-repo-workspaces-feature'

describe('swapClaudeProjectTranscripts', () => {
  it('exchanges both project dirs so resume finds each session at its new cwd', async () => {
    const root = makeProjectsRoot()
    mkdirSync(join(root, DEFAULT_DIR))
    mkdirSync(join(root, FEATURE_DIR))
    writeFileSync(join(root, DEFAULT_DIR, 'main-session.jsonl'), 'main\n')
    writeFileSync(join(root, FEATURE_DIR, 'feature-session.jsonl'), 'feature\n')

    await swapClaudeProjectTranscripts(DEFAULT_PATH, FEATURE_PATH, root)

    expect(readFileSync(join(root, DEFAULT_DIR, 'feature-session.jsonl'), 'utf-8')).toBe(
      'feature\n'
    )
    expect(readFileSync(join(root, FEATURE_DIR, 'main-session.jsonl'), 'utf-8')).toBe('main\n')
  })

  it('moves a lone project dir to the counterpart path', async () => {
    const root = makeProjectsRoot()
    mkdirSync(join(root, FEATURE_DIR))
    writeFileSync(join(root, FEATURE_DIR, 'feature-session.jsonl'), 'feature\n')

    await swapClaudeProjectTranscripts(DEFAULT_PATH, FEATURE_PATH, root)

    expect(readFileSync(join(root, DEFAULT_DIR, 'feature-session.jsonl'), 'utf-8')).toBe(
      'feature\n'
    )
  })

  it('is a no-op when neither side has transcripts', async () => {
    const root = makeProjectsRoot()
    await expect(
      swapClaudeProjectTranscripts(DEFAULT_PATH, FEATURE_PATH, root)
    ).resolves.toBeUndefined()
  })
  // Claude folds every non-alphanumeric to '-', so two Hangul worktree names of
  // the same length under one parent share a transcript dir. Swapping it would
  // stage the only copy away and fail, stranding it under a hidden name.
  it('leaves the shared dir alone when two Hangul paths encode identically', async () => {
    const root = makeProjectsRoot()
    const leftPath = '/repo/workspaces/작업트리'
    const rightPath = '/repo/workspaces/한글경로'
    const sharedDir = '-repo-workspaces-----'
    mkdirSync(join(root, sharedDir))
    writeFileSync(join(root, sharedDir, 'session.jsonl'), 'shared\n')

    await expect(swapClaudeProjectTranscripts(leftPath, rightPath, root)).resolves.toBeUndefined()

    expect(readFileSync(join(root, sharedDir, 'session.jsonl'), 'utf-8')).toBe('shared\n')
    expect(readdirSync(root)).toEqual([sharedDir])
  })

  it('swaps Hangul paths that encode distinctly', async () => {
    const root = makeProjectsRoot()
    const leftPath = '/repo/작업'
    const rightPath = '/repo/작업트리'
    const leftDir = '-repo---'
    const rightDir = '-repo-----'
    mkdirSync(join(root, leftDir))
    mkdirSync(join(root, rightDir))
    writeFileSync(join(root, leftDir, 'left.jsonl'), 'left\n')
    writeFileSync(join(root, rightDir, 'right.jsonl'), 'right\n')

    await swapClaudeProjectTranscripts(leftPath, rightPath, root)

    expect(readFileSync(join(root, leftDir, 'right.jsonl'), 'utf-8')).toBe('right\n')
    expect(readFileSync(join(root, rightDir, 'left.jsonl'), 'utf-8')).toBe('left\n')
  })

  it('restores both histories when the final rename fails', async () => {
    const root = makeProjectsRoot()
    const left = '/repo'
    const right = '/repo/workspaces/feature'
    const leftDir = join(root, encodeClaudeProjectPath(left))
    const rightDir = join(root, encodeClaudeProjectPath(right))
    mkdirSync(leftDir, { recursive: true })
    mkdirSync(rightDir, { recursive: true })
    writeFileSync(join(leftDir, 'a.jsonl'), 'left history')
    writeFileSync(join(rightDir, 'b.jsonl'), 'right history')
    failRenameOnCall = 3

    await expect(swapClaudeProjectTranscripts(left, right, root)).rejects.toThrow()

    // Both histories are back under their own keys, nothing stranded in staging.
    expect(readFileSync(join(leftDir, 'a.jsonl'), 'utf-8')).toBe('left history')
    expect(readFileSync(join(rightDir, 'b.jsonl'), 'utf-8')).toBe('right history')
    expect(readdirSync(root).filter((name) => name.startsWith('.orca-transcript-swap-'))).toEqual(
      []
    )
  })

  it('refuses a POSIX path with a backslash it cannot key faithfully', async () => {
    if (process.platform === 'win32') {
      return
    }
    const root = makeProjectsRoot()

    await expect(swapClaudeProjectTranscripts('/repo/a\\b', '/repo', root)).rejects.toThrow(
      'claude_transcript_swap_ambiguous_path'
    )
  })
})
