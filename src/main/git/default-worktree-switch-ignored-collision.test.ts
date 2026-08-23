import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findIgnoredPathsTrackedOnBranch } from './default-worktree-switch-ignored-collision'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

/** A repo on `main` plus a `feature` branch, both reachable from one worktree —
 *  the detector only reads trees, so no second checkout is needed. */
function createRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'orca-ignored-collision-')))
  git(root, ['init', '.'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Orca Test'])
  git(root, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  writeFileSync(join(root, 'scene.txt'), 'main\n')
  git(root, ['add', 'scene.txt'])
  git(root, ['commit', '-m', 'main'])
  return root
}

/** Commit `paths` onto `branch` without disturbing the checked-out worktree. */
function commitOnBranch(repo: string, branch: string, paths: string[]): void {
  for (const path of paths) {
    mkdirSync(join(repo, path, '..'), { recursive: true })
    writeFileSync(join(repo, path), `tracked on ${branch}\n`)
    git(repo, ['update-index', '--add', '--', path])
  }
  const tree = git(repo, ['write-tree'])
  const parent = git(repo, ['rev-parse', 'HEAD'])
  const commit = git(repo, ['commit-tree', tree, '-p', parent, '-m', `${branch} content`])
  git(repo, ['update-ref', `refs/heads/${branch}`, commit])
  git(repo, ['reset', '--quiet', '--mixed', 'HEAD'])
}

describe('ignored-path collision detection', () => {
  it('reports an ignored directory the incoming branch tracks files under', async () => {
    const repo = createRepo()
    commitOnBranch(repo, 'feature', ['Library/artifact'])
    writeFileSync(join(repo, '.gitignore'), 'Library/\n')
    mkdirSync(join(repo, 'Library', 'deep'), { recursive: true })
    writeFileSync(join(repo, 'Library', 'deep', 'cache'), 'expensive\n')

    expect(await findIgnoredPathsTrackedOnBranch(repo, 'feature', {})).toEqual(['Library/'])
  })

  it('reports an ignored file the incoming branch tracks', async () => {
    const repo = createRepo()
    commitOnBranch(repo, 'feature', ['secrets.env'])
    writeFileSync(join(repo, '.gitignore'), 'secrets.env\n')
    writeFileSync(join(repo, 'secrets.env'), 'local\n')

    expect(await findIgnoredPathsTrackedOnBranch(repo, 'feature', {})).toEqual(['secrets.env'])
  })

  it('reports nothing when the branch does not track the ignored paths', async () => {
    const repo = createRepo()
    commitOnBranch(repo, 'feature', ['src/app.ts'])
    writeFileSync(join(repo, '.gitignore'), 'Library/\nnode_modules/\n*.log\n')
    mkdirSync(join(repo, 'Library'), { recursive: true })
    writeFileSync(join(repo, 'Library', 'cache'), 'expensive\n')
    writeFileSync(join(repo, 'run.log'), 'noise\n')

    expect(await findIgnoredPathsTrackedOnBranch(repo, 'feature', {})).toEqual([])
  })

  it('ignores a path that is tracked here too — that is an ordinary branch swap', async () => {
    const repo = createRepo()
    // Listed in .gitignore but already tracked on both sides, so the checkout
    // handles it the normal way and nothing is at risk.
    commitOnBranch(repo, 'feature', ['config.json'])
    writeFileSync(join(repo, 'config.json'), 'here\n')
    git(repo, ['add', '-f', 'config.json'])
    git(repo, ['commit', '-m', 'track config on main'])
    writeFileSync(join(repo, '.gitignore'), 'config.json\n')

    expect(await findIgnoredPathsTrackedOnBranch(repo, 'feature', {})).toEqual([])
  })

  it('probes an option-shaped branch name as a name, not a flag', async () => {
    const repo = createRepo()
    commitOnBranch(repo, '--detach', ['Library/artifact'])
    writeFileSync(join(repo, '.gitignore'), 'Library/\n')
    mkdirSync(join(repo, 'Library'), { recursive: true })
    writeFileSync(join(repo, 'Library', 'cache'), 'expensive\n')

    expect(await findIgnoredPathsTrackedOnBranch(repo, '--detach', {})).toEqual(['Library/'])
  })

  it('keeps request and reply aligned across a batch of many ignored paths', async () => {
    // The batch reply is matched back by position, so one dropped or extra line
    // would mis-attribute every later path — and a wrongly "safe" answer is
    // exactly the silent loss this guard exists to prevent. Only a scattered
    // subset is tracked, so a shifted reply cannot produce the expected set.
    const repo = createRepo()
    const name = (index: number) => `gen/artifact-${String(index).padStart(4, '0')}.bin`
    const trackedOnFeature = Array.from({ length: 300 }, (_, index) => index)
      .filter((index) => index % 7 === 3)
      .map(name)
    commitOnBranch(repo, 'feature', trackedOnFeature)
    // A tracked sibling keeps `gen/` from collapsing into a single entry.
    writeFileSync(join(repo, 'gen', 'keep.txt'), 'here\n')
    git(repo, ['add', 'gen/keep.txt'])
    git(repo, ['commit', '-m', 'track gen/keep.txt on main'])
    writeFileSync(join(repo, '.gitignore'), '*.bin\n')
    for (let index = 0; index < 300; index += 1) {
      writeFileSync(join(repo, name(index)), 'local\n')
    }

    expect(await findIgnoredPathsTrackedOnBranch(repo, 'feature', {})).toEqual(trackedOnFeature)
  })

  it('reports each ignored file individually when the directory also holds tracked files', async () => {
    const repo = createRepo()
    commitOnBranch(repo, 'feature', ['mixed/kept.txt', 'mixed/generated.bin'])
    writeFileSync(join(repo, 'mixed', 'kept.txt'), 'here\n')
    git(repo, ['add', 'mixed/kept.txt'])
    git(repo, ['commit', '-m', 'track kept on main'])
    writeFileSync(join(repo, '.gitignore'), '*.bin\n')
    writeFileSync(join(repo, 'mixed', 'generated.bin'), 'local\n')
    writeFileSync(join(repo, 'mixed', 'unrelated.bin'), 'local\n')

    expect(await findIgnoredPathsTrackedOnBranch(repo, 'feature', {})).toEqual([
      'mixed/generated.bin'
    ])
  })
})
