import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'

const seed = vi.fn()
vi.mock('../unity/unity-project-worktree', () => ({
  autoSeedUnityCacheAfterWorktreeCreate: (args: unknown) => seed(args)
}))

import { autoSeedUnityAfterLocalWorktreeCreate } from './runtime-local-worktree-unity-seed'

const repo = {
  id: 'repo-1',
  path: '/repos/game',
  unityAutoSeedCache: true,
  unityWorktreeTint: undefined,
  unityTintOverrides: { 'feature-a': '#112233' }
} as unknown as Repo

describe('autoSeedUnityAfterLocalWorktreeCreate', () => {
  beforeEach(() => {
    seed.mockReset()
    seed.mockResolvedValue(undefined)
  })

  it('hands the seeder the repo choice, the tint, and sibling labels without the default checkout', () => {
    const offer = vi.fn()
    autoSeedUnityAfterLocalWorktreeCreate({
      repo,
      worktreePath: '/wt/game/feature-b',
      repoWorktreePaths: ['/repos/game', '/wt/game/feature-a', '/wt/game/feature-b'],
      offer
    })

    expect(seed).toHaveBeenCalledTimes(1)
    expect(seed.mock.calls[0]![0]).toMatchObject({
      sourcePath: '/repos/game',
      worktreePath: '/wt/game/feature-b',
      decision: true,
      tint: true,
      tintOverridesByLabel: { 'feature-a': '#112233' },
      tintSiblingLabels: ['feature-a', 'feature-b'],
      offer
    })
  })

  it('reads an explicit tint opt-out, since undefined means on', () => {
    autoSeedUnityAfterLocalWorktreeCreate({
      repo: { ...repo, unityWorktreeTint: false } as Repo,
      worktreePath: '/wt/game/x',
      repoWorktreePaths: [],
      offer: vi.fn()
    })
    expect(seed.mock.calls[0]![0]).toMatchObject({ tint: false })
  })
})

/**
 * Why a source census: the seeder kept its own tests through the machamy.9
 * merge while upstream's module split dropped the only call. A green suite with
 * no caller is exactly what this guards against.
 */
describe('worktree create still invokes the Unity auto-seed', () => {
  const createSource = readFileSync(
    join(__dirname, 'orca-runtime-create-managed-worktree.ts'),
    'utf8'
  )

  it('imports the fork seed module', () => {
    expect(createSource).toContain("from './runtime-local-worktree-unity-seed'")
  })

  it('calls it after a local worktree is materialized', () => {
    expect(createSource).toContain('autoSeedUnityAfterLocalWorktreeCreate({')
    // Ordering: the call must sit after materialization, or there is no worktree to seed.
    expect(createSource.indexOf('autoSeedUnityAfterLocalWorktreeCreate({')).toBeGreaterThan(
      createSource.indexOf('await createRuntimeLocalManagedWorktree({')
    )
  })

  it('routes the first-time question through the notifier', () => {
    expect(createSource).toContain('this.notifier?.unityAutoSeedOffer?.(repo.id, created.path)')
  })
})
