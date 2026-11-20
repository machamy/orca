import { mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { GitBinaryTestFixture } from './git-binary.test-fixture'

const image = process.env.ORCA_GIT_COMPAT_IMAGE
const binary = process.env.ORCA_GIT_COMPAT_BINARY
const expectedVersion = process.env.ORCA_GIT_COMPAT_VERSION
const describeBinaryCompatibility = image || binary ? describe : describe.skip

type GitResult = { stdout: string; stderr: string }

describeBinaryCompatibility('real Git binary compatibility (fork worktree cases)', () => {
  let repoPath = ''
  let fixture: GitBinaryTestFixture

  async function runGit(args: string[]): Promise<GitResult> {
    return fixture.exec(args, fixture.executionRoot)
  }

  beforeAll(async () => {
    repoPath = await realpath(await mkdtemp(join(tmpdir(), 'orca-git-binary-compat-fork-')))
    fixture = new GitBinaryTestFixture(repoPath, '/repo')
    await fixture.start()
    const versionOutput = await runGit(['--version'])
    expect(versionOutput.stdout).toContain(`git version ${expectedVersion}`)

    await runGit(['init', '-q'])
    await runGit(['config', 'user.email', 'compatibility@example.invalid'])
    await runGit(['config', 'user.name', 'Compatibility Test'])
    await writeFile(join(repoPath, 'tracked.txt'), 'compatibility\n')
    await runGit(['add', 'tracked.txt'])
    await runGit(['commit', '-qm', 'initial'])
  })

  afterAll(async () => {
    if (repoPath) {
      try {
        await fixture.stop()
      } finally {
        await rm(repoPath, { recursive: true, force: true })
      }
    }
  })

  // Orca renames the checkout into a trash directory and then clears the registration, so
  // every supported Git must accept `worktree remove --force` on the now-missing path.
  it('deregisters a worktree whose directory was renamed away', async () => {
    await runGit(['worktree', 'add', '-b', 'compat-deferred', 'deferred-wt'])
    await rename(join(repoPath, 'deferred-wt'), join(repoPath, 'deferred-trash'))

    await expect(runGit(['worktree', 'remove', '--force', 'deferred-wt'])).resolves.toBeDefined()

    const remaining = await runGit(['worktree', 'list', '--porcelain'])
    expect(remaining.stdout).not.toContain('deferred-wt')
    await rm(join(repoPath, 'deferred-trash'), { recursive: true, force: true })
  })
})
