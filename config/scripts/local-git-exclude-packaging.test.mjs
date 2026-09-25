import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { localGitExcludePackagingPatterns } = require('./local-git-exclude-packaging.cjs')

let root = null

function repoWithExclude(content) {
  root = mkdtempSync(join(tmpdir(), 'orca-exclude-'))
  if (content !== null) {
    mkdirSync(join(root, '.git', 'info'), { recursive: true })
    writeFileSync(join(root, '.git', 'info', 'exclude'), content)
  }
  return root
}

afterEach(() => {
  if (root) {
    rmSync(root, { recursive: true, force: true })
    root = null
  }
})

describe('localGitExcludePackagingPatterns', () => {
  it('turns top-level literal entries into packaging excludes', () => {
    const repo = repoWithExclude('# comment\n/side-repo/\n/scratch.txt\nnotes/\n\n')
    expect(localGitExcludePackagingPatterns(repo)).toEqual([
      '!side-repo{,/**/*}',
      '!scratch.txt{,/**/*}',
      '!notes{,/**/*}'
    ])
  })

  it('skips globs, negations and nested paths rather than guessing', () => {
    const repo = repoWithExclude('**/.claude/worktrees/\n!keep\n*.log\n.claude/worktrees/\n')
    expect(localGitExcludePackagingPatterns(repo)).toEqual([])
  })

  it('never drops a build input even when listed locally', () => {
    const repo = repoWithExclude('/out/\n/node_modules/\nresources/\npackage.json\n')
    expect(localGitExcludePackagingPatterns(repo)).toEqual([])
  })

  it('returns nothing when there is no exclude file', () => {
    expect(localGitExcludePackagingPatterns(repoWithExclude(null))).toEqual([])
  })

  it('dedupes repeated names', () => {
    const repo = repoWithExclude('/side/\nside/\n/side\n')
    expect(localGitExcludePackagingPatterns(repo)).toEqual(['!side{,/**/*}'])
  })
})
