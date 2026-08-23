import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { switchDefaultWorktree } from './default-worktree-switch'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

function createRepo(options: { nested?: boolean } = {}): {
  primaryPath: string
  targetPath: string
  mainHead: string
  targetHead: string
} {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'orca-default-worktree-')))
  const primaryPath = join(root, 'repo')
  const targetPath = options.nested
    ? join(primaryPath, '.orca', 'worktrees', 'feature')
    : join(root, 'feature')
  git(root, ['init', primaryPath])
  git(primaryPath, ['config', 'user.email', 'test@example.com'])
  git(primaryPath, ['config', 'user.name', 'Orca Test'])
  git(primaryPath, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  writeFileSync(join(primaryPath, 'scene.txt'), 'main\n')
  git(primaryPath, ['add', 'scene.txt'])
  git(primaryPath, ['commit', '-m', 'main'])
  const mainHead = git(primaryPath, ['rev-parse', 'HEAD'])
  mkdirSync(join(targetPath, '..'), { recursive: true })
  git(primaryPath, ['worktree', 'add', '-b', 'feature', targetPath])
  writeFileSync(join(targetPath, 'scene.txt'), 'feature\n')
  git(targetPath, ['commit', '-am', 'feature'])
  return {
    primaryPath,
    targetPath,
    mainHead,
    targetHead: git(targetPath, ['rev-parse', 'HEAD'])
  }
}

function gitMainWorktreePath(repoPath: string): string {
  const firstLine = git(repoPath, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .find((line) => line.startsWith('worktree '))
  return realpathSync((firstLine ?? '').slice('worktree '.length))
}

describe('default worktree switch (branch swap)', () => {
  it('checks the selected branch out at the repo path and the old default at the selected path', async () => {
    const repo = createRepo()

    const result = await switchDefaultWorktree({
      defaultPath: repo.primaryPath,
      selectedPath: repo.targetPath
    })

    expect(result).toMatchObject({ promotedBranch: 'feature', demotedBranch: 'main' })
    expect(git(repo.primaryPath, ['branch', '--show-current'])).toBe('feature')
    expect(git(repo.primaryPath, ['rev-parse', 'HEAD'])).toBe(repo.targetHead)
    expect(git(repo.targetPath, ['branch', '--show-current'])).toBe('main')
    expect(git(repo.targetPath, ['rev-parse', 'HEAD'])).toBe(repo.mainHead)
  })

  it('keeps git’s main worktree at the repo path (never moves the .git directory)', async () => {
    const repo = createRepo()

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    expect(gitMainWorktreePath(repo.primaryPath)).toBe(realpathSync(repo.primaryPath))
  })

  it('is reversible: switching the same pair again restores the original branches', async () => {
    const repo = createRepo()
    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    expect(git(repo.primaryPath, ['branch', '--show-current'])).toBe('main')
    expect(git(repo.targetPath, ['branch', '--show-current'])).toBe('feature')
    expect(gitMainWorktreePath(repo.primaryPath)).toBe(realpathSync(repo.primaryPath))
  })

  it('moves each side’s uncommitted + staged + untracked changes onto its branch’s new home', async () => {
    const repo = createRepo()
    writeFileSync(join(repo.primaryPath, 'main-dirty.txt'), 'main dirty\n')
    writeFileSync(join(repo.targetPath, 'feature-staged.txt'), 'feature staged\n')
    git(repo.targetPath, ['add', 'feature-staged.txt'])

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    // feature's staged file follows the feature branch to the repo path, still staged.
    expect(readFileSync(join(repo.primaryPath, 'feature-staged.txt'), 'utf-8')).toBe(
      'feature staged\n'
    )
    expect(git(repo.primaryPath, ['diff', '--cached', '--name-only'])).toBe('feature-staged.txt')
    // main's dirty file follows the main branch to the selected path.
    expect(readFileSync(join(repo.targetPath, 'main-dirty.txt'), 'utf-8')).toBe('main dirty\n')
  })

  it('leaves untracked files in their folder when includeUntracked is false', async () => {
    const repo = createRepo()
    writeFileSync(join(repo.primaryPath, 'main-untracked.txt'), 'main untracked\n')
    writeFileSync(join(repo.primaryPath, 'scene.txt'), 'main edited\n')
    writeFileSync(join(repo.targetPath, 'feature-untracked.txt'), 'feature untracked\n')

    await switchDefaultWorktree({
      defaultPath: repo.primaryPath,
      selectedPath: repo.targetPath,
      includeUntracked: false
    })

    // Untracked files stay put; the branch swaps around them.
    expect(readFileSync(join(repo.primaryPath, 'main-untracked.txt'), 'utf-8')).toBe(
      'main untracked\n'
    )
    expect(readFileSync(join(repo.targetPath, 'feature-untracked.txt'), 'utf-8')).toBe(
      'feature untracked\n'
    )
    // The tracked edit still follows its branch.
    expect(readFileSync(join(repo.targetPath, 'scene.txt'), 'utf-8')).toBe('main edited\n')
  })

  it('captures nothing when the only local change is untracked and it must stay', async () => {
    const repo = createRepo()
    writeFileSync(join(repo.primaryPath, 'only-untracked.txt'), 'stay\n')

    await expect(
      switchDefaultWorktree({
        defaultPath: repo.primaryPath,
        selectedPath: repo.targetPath,
        includeUntracked: false
      })
    ).resolves.toMatchObject({ promotedBranch: 'feature' })

    expect(readFileSync(join(repo.primaryPath, 'only-untracked.txt'), 'utf-8')).toBe('stay\n')
    expect(git(repo.primaryPath, ['stash', 'list'])).toBe('')
  })

  it('leaves ignored files in place (they do not follow the branch)', async () => {
    const repo = createRepo()
    writeFileSync(join(repo.primaryPath, '.gitignore'), 'build/\n')
    git(repo.primaryPath, ['add', '.gitignore'])
    git(repo.primaryPath, ['commit', '-m', 'ignore build'])
    mkdirSync(join(repo.primaryPath, 'build'), { recursive: true })
    writeFileSync(join(repo.primaryPath, 'build', 'artifact'), 'repo build\n')

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    expect(readFileSync(join(repo.primaryPath, 'build', 'artifact'), 'utf-8')).toBe('repo build\n')
  })

  // Git silently overwrites IGNORED files on checkout (untracked ones it
  // refuses), and nothing captures them — no stash, no rescue ref. So an ignored
  // path on one side that the arriving branch tracks was destroyed with no
  // warning and no way back. Reproduced against real git before the guard.
  it('refuses the swap instead of destroying an ignored file the other branch tracks', async () => {
    const repo = createRepo()
    writeFileSync(join(repo.primaryPath, '.gitignore'), 'Library/\n')
    git(repo.primaryPath, ['add', '.gitignore'])
    git(repo.primaryPath, ['commit', '-m', 'ignore Library'])
    // The other branch tracks the very path this side ignores.
    mkdirSync(join(repo.targetPath, 'Library'), { recursive: true })
    writeFileSync(join(repo.targetPath, 'Library', 'artifact'), 'tracked on feature\n')
    git(repo.targetPath, ['add', '-f', 'Library/artifact'])
    git(repo.targetPath, ['commit', '-m', 'track Library'])
    // Local build output on the default side — expensive, ignored, unrecoverable.
    mkdirSync(join(repo.primaryPath, 'Library'), { recursive: true })
    writeFileSync(join(repo.primaryPath, 'Library', 'artifact'), 'local build cache\n')

    await expect(
      switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })
    ).rejects.toThrow('default_worktree_switch_ignored_would_be_overwritten')

    expect(readFileSync(join(repo.primaryPath, 'Library', 'artifact'), 'utf-8')).toBe(
      'local build cache\n'
    )
    // Refused before any mutation: branches, stash stack and rescue refs untouched.
    expect(git(repo.primaryPath, ['branch', '--show-current'])).toBe('main')
    expect(git(repo.targetPath, ['branch', '--show-current'])).toBe('feature')
    expect(git(repo.primaryPath, ['stash', 'list'])).toBe('')
    expect(git(repo.primaryPath, ['for-each-ref', '--format=%(refname)', 'refs/orca/'])).toBe('')
  })

  it('names the colliding paths and the branch that would overwrite them', async () => {
    const repo = createRepo()
    writeFileSync(join(repo.primaryPath, '.gitignore'), 'secrets.env\n')
    git(repo.primaryPath, ['add', '.gitignore'])
    git(repo.primaryPath, ['commit', '-m', 'ignore secrets'])
    writeFileSync(join(repo.targetPath, 'secrets.env'), 'tracked on feature\n')
    git(repo.targetPath, ['add', '-f', 'secrets.env'])
    git(repo.targetPath, ['commit', '-m', 'track secrets'])
    writeFileSync(join(repo.primaryPath, 'secrets.env'), 'local secret\n')

    const error = await switchDefaultWorktree({
      defaultPath: repo.primaryPath,
      selectedPath: repo.targetPath
    }).catch((thrown: unknown) => thrown)

    const message = error instanceof Error ? error.message : String(error)
    expect(message).toContain('secrets.env')
    expect(message).toContain('feature')
    expect(message).toContain(repo.primaryPath)
  })

  it('detects the collision on the selected side too (demoted branch arriving there)', async () => {
    const repo = createRepo()
    // main tracks dist/bundle; the selected worktree ignores dist/ and has one.
    mkdirSync(join(repo.primaryPath, 'dist'), { recursive: true })
    writeFileSync(join(repo.primaryPath, 'dist', 'bundle'), 'tracked on main\n')
    git(repo.primaryPath, ['add', 'dist/bundle'])
    git(repo.primaryPath, ['commit', '-m', 'track dist'])
    writeFileSync(join(repo.targetPath, '.gitignore'), 'dist/\n')
    git(repo.targetPath, ['add', '.gitignore'])
    git(repo.targetPath, ['commit', '-m', 'ignore dist'])
    mkdirSync(join(repo.targetPath, 'dist'), { recursive: true })
    writeFileSync(join(repo.targetPath, 'dist', 'bundle'), 'selected build output\n')

    await expect(
      switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })
    ).rejects.toThrow('default_worktree_switch_ignored_would_be_overwritten')

    expect(readFileSync(join(repo.targetPath, 'dist', 'bundle'), 'utf-8')).toBe(
      'selected build output\n'
    )
  })

  it('still swaps when the ignored paths do not exist on the other branch', async () => {
    const repo = createRepo()
    writeFileSync(join(repo.primaryPath, '.gitignore'), 'Library/\nnode_modules/\n*.log\n')
    git(repo.primaryPath, ['add', '.gitignore'])
    git(repo.primaryPath, ['commit', '-m', 'ignore build output'])
    mkdirSync(join(repo.primaryPath, 'Library', 'deep'), { recursive: true })
    writeFileSync(join(repo.primaryPath, 'Library', 'deep', 'cache'), 'expensive\n')
    writeFileSync(join(repo.primaryPath, 'run.log'), 'noise\n')

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    // The promise the first-run warning makes: ignored files stay put.
    expect(readFileSync(join(repo.primaryPath, 'Library', 'deep', 'cache'), 'utf-8')).toBe(
      'expensive\n'
    )
    expect(readFileSync(join(repo.primaryPath, 'run.log'), 'utf-8')).toBe('noise\n')
    expect(git(repo.primaryPath, ['branch', '--show-current'])).toBe('feature')
  })

  it('handles an ignored path whose name contains a newline', async () => {
    const repo = createRepo()
    const oddName = 'odd\nname.txt'
    writeFileSync(join(repo.primaryPath, '.gitignore'), 'odd?name.txt\n')
    git(repo.primaryPath, ['add', '.gitignore'])
    git(repo.primaryPath, ['commit', '-m', 'ignore odd'])
    writeFileSync(join(repo.targetPath, oddName), 'tracked on feature\n')
    git(repo.targetPath, ['add', '-f', '--', oddName])
    git(repo.targetPath, ['commit', '-m', 'track odd'])
    writeFileSync(join(repo.primaryPath, oddName), 'local odd\n')

    await expect(
      switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })
    ).rejects.toThrow('default_worktree_switch_ignored_would_be_overwritten')

    expect(readFileSync(join(repo.primaryPath, oddName), 'utf-8')).toBe('local odd\n')
  })

  it('swaps a worktree whose path, branch and files are Hangul', async () => {
    // macOS normalizes Hangul filenames differently per filesystem (NFD on HFS+,
    // as-written on APFS), and git quotes non-ASCII in some porcelain output —
    // both would break path matching or the stash round-trip.
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'orca-default-worktree-')))
    const primaryPath = join(root, 'repo')
    const targetPath = join(root, '작업트리-한글')
    git(root, ['init', primaryPath])
    git(primaryPath, ['config', 'user.email', 'test@example.com'])
    git(primaryPath, ['config', 'user.name', 'Orca Test'])
    git(primaryPath, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
    writeFileSync(join(primaryPath, '장면.txt'), 'main\n')
    git(primaryPath, ['add', '.'])
    git(primaryPath, ['commit', '-m', 'main'])
    git(primaryPath, ['worktree', 'add', '-b', '기능브랜치', targetPath])
    writeFileSync(join(targetPath, '장면.txt'), 'feature\n')
    git(targetPath, ['commit', '-am', 'feature'])
    writeFileSync(join(primaryPath, '메모-미추적.txt'), 'main memo\n')

    const result = await switchDefaultWorktree({
      defaultPath: primaryPath,
      selectedPath: targetPath
    })

    expect(result).toMatchObject({ promotedBranch: '기능브랜치', demotedBranch: 'main' })
    expect(git(primaryPath, ['branch', '--show-current'])).toBe('기능브랜치')
    expect(git(targetPath, ['branch', '--show-current'])).toBe('main')
    // The Hangul untracked file follows its branch to the other worktree.
    expect(readFileSync(join(targetPath, '메모-미추적.txt'), 'utf-8')).toBe('main memo\n')
  })

  it('works when the selected worktree is nested under the repo path', async () => {
    const repo = createRepo({ nested: true })

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    expect(git(repo.primaryPath, ['branch', '--show-current'])).toBe('feature')
    expect(git(repo.targetPath, ['branch', '--show-current'])).toBe('main')
    expect(gitMainWorktreePath(repo.primaryPath)).toBe(realpathSync(repo.primaryPath))
  })

  it('resolves cleanly with each side editing the same shared file (no conflict)', async () => {
    const repo = createRepo()
    writeFileSync(join(repo.primaryPath, 'scene.txt'), 'main edit\n')
    writeFileSync(join(repo.targetPath, 'scene.txt'), 'feature edit\n')

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    expect(readFileSync(join(repo.primaryPath, 'scene.txt'), 'utf-8')).toBe('feature edit\n')
    expect(readFileSync(join(repo.targetPath, 'scene.txt'), 'utf-8')).toBe('main edit\n')
  })

  it('does not lose the default worktree’s changes when the selected capture fails', async () => {
    const repo = createRepo()
    // Leave the selected worktree mid-merge so its stash capture is rejected.
    git(repo.targetPath, ['switch', '-c', 'other', 'main'])
    writeFileSync(join(repo.targetPath, 'scene.txt'), 'other\n')
    git(repo.targetPath, ['commit', '-am', 'other'])
    git(repo.targetPath, ['switch', 'feature'])
    try {
      git(repo.targetPath, ['merge', 'other'])
    } catch {
      /* expected conflict leaves MERGE_HEAD */
    }
    // The default worktree has precious uncommitted work.
    writeFileSync(join(repo.primaryPath, 'precious.txt'), 'keep me\n')

    await expect(
      switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })
    ).rejects.toThrow('default_worktree_switch_operation_in_progress')

    // The default worktree is untouched — its uncommitted work survives.
    expect(readFileSync(join(repo.primaryPath, 'precious.txt'), 'utf-8')).toBe('keep me\n')
    expect(git(repo.primaryPath, ['branch', '--show-current'])).toBe('main')
  })

  it('completes despite a post-checkout hook that exits non-zero', async () => {
    const repo = createRepo()
    const hook = join(repo.primaryPath, '.git', 'hooks', 'post-checkout')
    mkdirSync(join(hook, '..'), { recursive: true })
    writeFileSync(hook, '#!/bin/sh\nexit 1\n')
    execFileSync('chmod', ['+x', hook])

    const result = await switchDefaultWorktree({
      defaultPath: repo.primaryPath,
      selectedPath: repo.targetPath
    })

    expect(git(repo.primaryPath, ['branch', '--show-current'])).toBe('feature')
    expect(git(repo.targetPath, ['branch', '--show-current'])).toBe('main')
    expect(git(repo.primaryPath, ['status', '--porcelain'])).toBe('')
    // The error was recovered from, not hidden: a hook can exit non-zero AFTER
    // git already broke the tree (or an LFS smudge can), so the caller hears it.
    expect(result.checkoutWarnings?.length ?? 0).toBeGreaterThan(0)
  })

  it('keeps the rescue refs when a checkout warned, and names them', async () => {
    // A hook failure can hide an incomplete tree; deleting the rescue refs on
    // that "success" destroyed the only complete copy of the captured work.
    const repo = createRepo()
    writeFileSync(join(repo.targetPath, 'wip.txt'), 'uncommitted\n')
    const hook = join(repo.primaryPath, '.git', 'hooks', 'post-checkout')
    mkdirSync(join(hook, '..'), { recursive: true })
    writeFileSync(hook, '#!/bin/sh\nexit 1\n')
    execFileSync('chmod', ['+x', hook])

    const result = await switchDefaultWorktree({
      defaultPath: repo.primaryPath,
      selectedPath: repo.targetPath
    })

    expect(result.retainedRescueRefs?.length ?? 0).toBeGreaterThan(0)
    for (const ref of result.retainedRescueRefs ?? []) {
      expect(git(repo.primaryPath, ['rev-parse', '--verify', ref])).toMatch(/[0-9a-f]{40}/)
    }
    // The work still travelled with its branch despite the warning.
    expect(readFileSync(join(repo.primaryPath, 'wip.txt'), 'utf-8')).toBe('uncommitted\n')
  })

  it('drops the park branch even when its tip is unmerged from the other side', async () => {
    // `branch -d` judges merged-ness against the CWD's HEAD, and cleanup runs
    // from the repo path — the park tip (the selected side's baseline) is
    // rarely merged into it, so a clean switch left park debris and a clean
    // ROLLBACK reported recovery_required over nothing.
    const repo = createRepo()
    // Diverge the branches so the selected tip is unmerged from main.
    writeFileSync(join(repo.targetPath, 'diverge.txt'), 'x\n')
    git(repo.targetPath, ['add', '.'])
    git(repo.targetPath, ['commit', '-m', 'diverge'])

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    const branches = git(repo.primaryPath, ['branch', '--list', 'orca/default-switch-*'])
    expect(branches.trim()).toBe('')
  })

  // `git branch` refuses option-shaped names but `git update-ref` accepts them,
  // and clone propagates them. Without a `--` separator `git switch` parsed the
  // name AS an option: `--detach` detached HEAD at the wrong worktree while the
  // swap reported success, and `--help` exited 0 without switching at all.
  it('treats an option-shaped branch name as a name, not a flag', async () => {
    const repo = createRepo()
    const head = git(repo.targetPath, ['rev-parse', 'HEAD'])
    git(repo.targetPath, ['update-ref', 'refs/heads/--detach', head])
    git(repo.targetPath, ['symbolic-ref', 'HEAD', 'refs/heads/--detach'])

    const result = await switchDefaultWorktree({
      defaultPath: repo.primaryPath,
      selectedPath: repo.targetPath
    })

    expect(result).toMatchObject({ promotedBranch: '--detach', demotedBranch: 'main' })
    // The real proof: HEAD stayed symbolic and the branch actually moved.
    expect(git(repo.primaryPath, ['symbolic-ref', '--short', 'HEAD'])).toBe('--detach')
    expect(git(repo.targetPath, ['symbolic-ref', '--short', 'HEAD'])).toBe('main')
  })

  it('keeps captured work on a discoverable rescue ref, not a dangling commit', async () => {
    const repo = createRepo()
    writeFileSync(join(repo.primaryPath, 'scene.txt'), 'main edited\n')

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    // On success the work is applied and the rescue ref is released.
    expect(readFileSync(join(repo.targetPath, 'scene.txt'), 'utf-8')).toBe('main edited\n')
    expect(git(repo.primaryPath, ['for-each-ref', '--format=%(refname)', 'refs/orca/'])).toBe('')
  })

  it('does not consume a pre-existing user stash when there is nothing new to save', async () => {
    const repo = createRepo()
    // A stash the user made themselves, unrelated to the switch.
    writeFileSync(join(repo.primaryPath, 'scene.txt'), 'user work\n')
    git(repo.primaryPath, ['stash', 'push', '--message', 'user-own-stash'])
    const userStash = git(repo.primaryPath, ['rev-parse', 'refs/stash'])

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    // The user's stash must still be on the stack, untouched.
    expect(git(repo.primaryPath, ['rev-parse', 'refs/stash'])).toBe(userStash)
    expect(git(repo.primaryPath, ['stash', 'list'])).toContain('user-own-stash')
  })

  it('rejects a detached-HEAD selected worktree instead of guessing a ref', async () => {
    const repo = createRepo()
    git(repo.targetPath, ['switch', '--detach'])

    await expect(
      switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })
    ).rejects.toThrow('default_worktree_switch_detached_head')

    // The repo path is untouched by the rejected switch.
    expect(git(repo.primaryPath, ['branch', '--show-current'])).toBe('main')
  })

  it('keeps a park-branch commit made mid-switch instead of force-deleting it', async () => {
    const repo = createRepo()
    // A post-checkout hook that commits onto whatever branch it lands on: the
    // park branch is the only ref to that commit, so `-D` would discard it.
    // Hooks live in the common dir, shared by every linked worktree.
    const hookDir = join(repo.primaryPath, '.git', 'hooks')
    mkdirSync(hookDir, { recursive: true })
    writeFileSync(
      join(hookDir, 'post-checkout'),
      [
        '#!/bin/sh',
        'case "$(git branch --show-current)" in',
        '  orca/default-switch-*)',
        '    echo hook > hook.txt && git add hook.txt && git commit -q -m hook;;',
        'esac',
        ''
      ].join('\n'),
      { mode: 0o755 }
    )

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    const parked = git(repo.primaryPath, ['branch', '--list', 'orca/default-switch-*'])
    expect(parked).not.toBe('')
    const parkBranch = parked.replace('*', '').trim().split('\n')[0].trim()
    expect(git(repo.primaryPath, ['log', '-1', '--format=%s', parkBranch])).toBe('hook')
  })

  it('drops the park branch on a clean switch', async () => {
    const repo = createRepo()

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    expect(git(repo.primaryPath, ['branch', '--list', 'orca/default-switch-*'])).toBe('')
  })

  it('leaves no rescue refs behind after a successful switch', async () => {
    const repo = createRepo()
    writeFileSync(join(repo.primaryPath, 'scene.txt'), 'default dirty\n')
    writeFileSync(join(repo.targetPath, 'scene.txt'), 'selected dirty\n')

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    expect(git(repo.primaryPath, ['for-each-ref', 'refs/orca/default-switch'])).toBe('')
  })

  it('adopts its own stash entry when another one is pushed onto the shared stack', async () => {
    const repo = createRepo()
    // The stash stack is repository-global: an entry pushed from the OTHER
    // worktree sits on top of ours, so position 0 is not our capture.
    writeFileSync(join(repo.primaryPath, 'scene.txt'), 'default dirty\n')
    writeFileSync(join(repo.targetPath, 'other.txt'), 'other worktree work\n')
    git(repo.targetPath, ['add', 'other.txt'])
    git(repo.targetPath, ['stash', 'push', '--message', 'other-worktree-stash'])

    await switchDefaultWorktree({ defaultPath: repo.primaryPath, selectedPath: repo.targetPath })

    // The unrelated entry survives, and the default's work landed on its branch.
    expect(git(repo.primaryPath, ['stash', 'list'])).toContain('other-worktree-stash')
    expect(readFileSync(join(repo.targetPath, 'scene.txt'), 'utf-8')).toBe('default dirty\n')
  })
})
