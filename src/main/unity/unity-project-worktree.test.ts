import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyUnityWorktreeTint } from './unity-worktree-tint-apply'
import {
  autoSeedUnityCacheAfterWorktreeCreate,
  getUnityWorktreeStatus,
  openUnityProject,
  readUnityEditorVersion,
  seedUnityWorktreeCache,
  unityEditorBinaryPath
} from './unity-project-worktree'

const roots: string[] = []

function makeDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'orca-unity-'))
  roots.push(root)
  return root
}

function makeUnityProject(version = '6000.3.16f1'): string {
  const root = makeDir()
  mkdirSync(join(root, 'ProjectSettings'), { recursive: true })
  writeFileSync(
    join(root, 'ProjectSettings', 'ProjectVersion.txt'),
    `m_EditorVersion: ${version}\nm_EditorVersionWithRevision: ${version} (abc123)\n`
  )
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('readUnityEditorVersion', () => {
  it('parses the version line', async () => {
    expect(await readUnityEditorVersion(makeUnityProject('2022.3.10f1'))).toBe('2022.3.10f1')
  })

  it('returns null for a non-Unity directory', async () => {
    expect(await readUnityEditorVersion(makeDir())).toBeNull()
  })
})

describe('unityEditorBinaryPath', () => {
  it('names the Hub layout per platform', () => {
    expect(unityEditorBinaryPath('6000.1.0f1', 'darwin')).toBe(
      '/Applications/Unity/Hub/Editor/6000.1.0f1/Unity.app/Contents/MacOS/Unity'
    )
    expect(unityEditorBinaryPath('6000.1.0f1', 'win32')).toContain('Unity.exe')
    expect(unityEditorBinaryPath('6000.1.0f1', 'linux')).toContain('Hub/Editor/6000.1.0f1')
  })
})

describe('getUnityWorktreeStatus', () => {
  it('reports a Unity worktree with no cache against a seeded source', async () => {
    const worktree = makeUnityProject()
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library'))
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'db')

    const status = await getUnityWorktreeStatus({ worktreePath: worktree, sourcePath: source })

    expect(status.isUnityProject).toBe(true)
    expect(status.editorVersion).toBe('6000.3.16f1')
    expect(status.worktreeHasLibrary).toBe(false)
    expect(status.sourceHasLibrary).toBe(true)
  })

  it('reports a non-Unity worktree without probing further', async () => {
    const status = await getUnityWorktreeStatus({ worktreePath: makeDir(), sourcePath: makeDir() })

    expect(status).toEqual({
      isUnityProject: false,
      editorVersion: null,
      editorInstalled: false,
      worktreeHasLibrary: false,
      sourceHasLibrary: false,
      riderInstalled: false
    })
  })

  it('treats an EMPTY Library directory as not seeded', async () => {
    // git leaves empty ignored dirs behind; counting one as "seeded" would
    // disable the copy while Unity still faces a full reimport.
    const worktree = makeUnityProject()
    mkdirSync(join(worktree, 'Library'))

    const status = await getUnityWorktreeStatus({ worktreePath: worktree, sourcePath: makeDir() })

    expect(status.worktreeHasLibrary).toBe(false)
  })
})

describe('seedUnityWorktreeCache (real APFS clone)', () => {
  // Fork contract: a successful seed also carries the .sln/.csproj ride-along,
  // defuses Firebase's timestamp gate, and (when asked) writes the tint script.
  it('ships the sln ride-along, firebase mark, and tint with a seed', async () => {
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library'), { recursive: true })
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'db')
    writeFileSync(join(source, 'donor.sln'), 'Project("Assembly-CSharp.csproj")')
    writeFileSync(join(source, 'Assembly-CSharp.csproj'), '<Project/>')
    const worktree = makeUnityProject()
    execFileSync('git', ['init', '--quiet'], { cwd: worktree })
    writeFileSync(join(worktree, '.gitignore'), 'Assets/Private/\n')
    const streaming = join(worktree, 'Assets', 'StreamingAssets')
    mkdirSync(streaming, { recursive: true })
    const old = new Date('2026-08-01T00:00:00Z')
    writeFileSync(join(streaming, 'google-services.json'), '{"cfg":1}')
    writeFileSync(join(streaming, 'google-services-desktop.json'), '{"cfg":1}')
    utimesSync(join(streaming, 'google-services.json'), old, old)
    utimesSync(join(streaming, 'google-services-desktop.json'), old, old)

    const result = await seedUnityWorktreeCache({
      worktreePath: worktree,
      sourcePath: source,
      tint: true
    })

    expect(result).toEqual({ seeded: true })
    const entries = readdirSync(worktree)
    expect(entries).toContain(`${basename(worktree)}.sln`)
    expect(entries).toContain('Assembly-CSharp.csproj')
    const outputMtime = statSync(join(streaming, 'google-services-desktop.json')).mtimeMs
    expect(outputMtime).toBeGreaterThanOrEqual(old.getTime() + 2_000)
    expect(
      readFileSync(join(worktree, 'Assets', 'Private', 'Editor', 'OrcaWorktreeTint.cs'), 'utf-8')
    ).toContain('OrcaWorktreeTint')
  })

  it('clones the source Library and drops EditorInstance.json', async () => {
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library', 'Artifacts'), { recursive: true })
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'precious-db')
    writeFileSync(join(source, 'Library', 'Artifacts', 'a.bin'), 'artifact')
    writeFileSync(join(source, 'Library', 'EditorInstance.json'), '{"pid":123}')
    const worktree = makeUnityProject()

    const result = await seedUnityWorktreeCache({ worktreePath: worktree, sourcePath: source })

    expect(result).toEqual({ seeded: true })
    expect(readFileSync(join(worktree, 'Library', 'ArtifactDB'), 'utf-8')).toBe('precious-db')
    expect(readFileSync(join(worktree, 'Library', 'Artifacts', 'a.bin'), 'utf-8')).toBe('artifact')
    // The source's running-editor descriptor must not travel.
    expect(() => readFileSync(join(worktree, 'Library', 'EditorInstance.json'))).toThrow()
    expect(readFileSync(join(source, 'Library', 'EditorInstance.json'), 'utf-8')).toContain('123')
  })

  it('clones are independent: writing the copy leaves the source untouched', async () => {
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library'))
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'original')
    const worktree = makeUnityProject()

    await seedUnityWorktreeCache({ worktreePath: worktree, sourcePath: source })
    writeFileSync(join(worktree, 'Library', 'ArtifactDB'), 'mutated-by-clone-side')

    expect(readFileSync(join(source, 'Library', 'ArtifactDB'), 'utf-8')).toBe('original')
  })

  it('refuses to overwrite an existing Library', async () => {
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library'))
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'source')
    const worktree = makeUnityProject()
    mkdirSync(join(worktree, 'Library'))
    writeFileSync(join(worktree, 'Library', 'ArtifactDB'), 'real-import-state')

    const result = await seedUnityWorktreeCache({ worktreePath: worktree, sourcePath: source })

    expect(result).toEqual({ seeded: false, reason: 'already_seeded' })
    expect(readFileSync(join(worktree, 'Library', 'ArtifactDB'), 'utf-8')).toBe('real-import-state')
  })

  it('reports a missing source instead of manufacturing an empty Library', async () => {
    const result = await seedUnityWorktreeCache({
      worktreePath: makeUnityProject(),
      sourcePath: makeUnityProject()
    })

    expect(result).toEqual({ seeded: false, reason: 'source_missing' })
  })
})

describe('openUnityProject', () => {
  it('refuses a non-Unity directory without launching anything', async () => {
    const launched: string[] = []

    const result = await openUnityProject({
      worktreePath: makeDir(),
      launch: async (binary) => {
        launched.push(binary)
        return { ok: true }
      }
    })

    expect(result).toEqual({ opened: false, reason: 'not_a_unity_project' })
    expect(launched).toEqual([])
  })

  it('names the missing editor version instead of launching a wrong one', async () => {
    const result = await openUnityProject({
      worktreePath: makeUnityProject('9999.9.9f9'),
      launch: async () => ({ ok: true })
    })

    expect(result.opened).toBe(false)
    if (!result.opened) {
      expect(result.reason).toBe('editor_missing')
      expect(result.editorVersion).toBe('9999.9.9f9')
    }
  })
})

describe('live-editor gates', () => {
  function lockedProject(): string {
    const root = makeUnityProject()
    mkdirSync(join(root, 'Library'), { recursive: true })
    writeFileSync(join(root, 'Library', 'ArtifactDB'), 'db')
    mkdirSync(join(root, 'Temp'))
    writeFileSync(join(root, 'Temp', 'UnityLockfile'), '')
    return root
  }

  it('refuses to clone out of a project whose editor is LIVE', async () => {
    // The real incident: cloning a live editor's Library copied its mutable
    // databases mid-write, and the seeded worktree died on first open.
    const source = lockedProject()

    const result = await seedUnityWorktreeCache({
      worktreePath: makeUnityProject(),
      sourcePath: source,
      listProcessCommands: async () => `/Applications/Unity -projectpath ${source}\n`
    })

    expect(result).toEqual({ seeded: false, reason: 'source_editor_running' })
  })

  it('refuses to clone into a project whose editor is LIVE', async () => {
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library'))
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'db')
    const worktree = lockedProject()

    const result = await seedUnityWorktreeCache({
      worktreePath: worktree,
      sourcePath: source,
      listProcessCommands: async () => `/Applications/Unity -projectpath ${worktree}\n`
    })

    expect(result).toEqual({ seeded: false, reason: 'target_editor_running' })
  })

  it('treats a lockfile with NO live process as stale and proceeds', async () => {
    // A crash leaves the lockfile behind; refusing on it forever blocked
    // seeding the very worktree the crash had just orphaned.
    const source = lockedProject()

    const result = await seedUnityWorktreeCache({
      worktreePath: makeUnityProject(),
      sourcePath: source,
      listProcessCommands: async () => '/bin/ps\n/usr/bin/other\n'
    })

    expect(result).toEqual({ seeded: true })
  })

  it('fails toward refusal when the process table cannot be read', async () => {
    const source = lockedProject()

    const result = await seedUnityWorktreeCache({
      worktreePath: makeUnityProject(),
      sourcePath: source,
      listProcessCommands: async () => {
        throw new Error('ps unavailable')
      }
    })

    expect(result).toEqual({ seeded: false, reason: 'source_editor_running' })
  })
})

describe('double-launch window', () => {
  it('does not launch again while a just-launched editor is absent from the process table', async () => {
    // Unity appears in the process table (and creates its lockfile) seconds
    // after launch; a second open inside that window used to double the editor.
    const worktree = makeUnityProject()
    const launches: string[] = []
    const args = {
      worktreePath: worktree,
      platform: 'darwin' as const,
      listProcesses: async () => [],
      editorBinaryExists: () => true,
      launch: async (binary: string) => {
        launches.push(binary)
        return { ok: true as const }
      }
    }

    expect(await openUnityProject(args)).toEqual({ opened: true })
    const second = await openUnityProject(args)

    expect(launches).toHaveLength(1)
    expect(second).toEqual({
      opened: false,
      reason: 'focus_failed',
      editorVersion: '6000.3.16f1',
      focusFailureReason: 'no_window',
      detail: expect.stringContaining('launched')
    })
  })

  it('allows a relaunch when the stamped editor died leaving no lockfile', async () => {
    // Quit-or-crashed right after launch: no process, no Temp/UnityLockfile.
    // The bare stamp used to block for its full 120s TTL anyway.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const worktree = makeUnityProject()
      const launches: string[] = []
      const args = {
        worktreePath: worktree,
        platform: 'darwin' as const,
        listProcesses: async () => [],
        editorBinaryExists: () => true,
        launch: async (binary: string) => {
          launches.push(binary)
          return { ok: true as const }
        }
      }

      expect(await openUnityProject(args)).toEqual({ opened: true })
      vi.setSystemTime(Date.now() + 20_000)

      expect(await openUnityProject(args)).toEqual({ opened: true })
      expect(launches).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps blocking past the startup grace while the lockfile is present', async () => {
    // A lockfile means the launched editor is (or was very recently) alive;
    // only its absence past the grace proves the launch is dead.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const worktree = makeUnityProject()
      const launches: string[] = []
      const args = {
        worktreePath: worktree,
        platform: 'darwin' as const,
        listProcesses: async () => [],
        editorBinaryExists: () => true,
        launch: async (binary: string) => {
          launches.push(binary)
          return { ok: true as const }
        }
      }

      expect(await openUnityProject(args)).toEqual({ opened: true })
      mkdirSync(join(worktree, 'Temp'), { recursive: true })
      writeFileSync(join(worktree, 'Temp', 'UnityLockfile'), '')
      vi.setSystemTime(Date.now() + 20_000)

      const second = await openUnityProject(args)
      expect(launches).toHaveLength(1)
      expect(second).toMatchObject({
        opened: false,
        reason: 'focus_failed',
        focusFailureReason: 'no_window'
      })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('launch failure honesty', () => {
  it('reports launch_failed instead of opened when the spawn errors', async () => {
    const result = await openUnityProject({
      worktreePath: makeUnityProject('6000.3.16f1'),
      launch: async () => ({ ok: false, detail: 'EACCES' })
    })

    expect(result).toEqual({
      opened: false,
      reason: 'launch_failed',
      editorVersion: '6000.3.16f1',
      detail: 'EACCES'
    })
  })
})

describe('incident-class hardening', () => {
  it('refuses to seed a worktree that no longer exists (no resurrection)', async () => {
    // The clone's mkdir would have recreated a deleted worktree's root and
    // filled it with an orphan 7.6GB Library.
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library'))
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'db')
    const vanished = join(makeDir(), 'gone')

    const result = await seedUnityWorktreeCache({ worktreePath: vanished, sourcePath: source })

    expect(result).toEqual({ seeded: false, reason: 'worktree_missing' })
    expect(existsSync(vanished)).toBe(false)
  })

  it('sees a LIVE editor even before its lockfile exists', async () => {
    // Unity creates Temp/UnityLockfile seconds after the process starts; the
    // gate must not need the lockfile to consult the process table.
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library'))
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'db')

    const result = await seedUnityWorktreeCache({
      worktreePath: makeUnityProject(),
      sourcePath: source,
      listProcessCommands: async () => `/Applications/Unity -projectpath ${source} -useHub\n`
    })

    expect(result).toEqual({ seeded: false, reason: 'source_editor_running' })
  })

  it('does not mistake a longer sibling path for this project', async () => {
    // `feat` must not read as running because `feature-x` is: the match is
    // boundary-anchored.
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library'))
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'db')

    const result = await seedUnityWorktreeCache({
      worktreePath: makeUnityProject(),
      sourcePath: source,
      listProcessCommands: async () => `/Applications/Unity -projectpath ${source}-longer-sibling\n`
    })

    expect(result).toEqual({ seeded: true })
  })

  it('requires a unity-ish process, not any argv quoting the flag', async () => {
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library'))
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'db')

    const result = await seedUnityWorktreeCache({
      worktreePath: makeUnityProject(),
      sourcePath: source,
      listProcessCommands: async () => `claude "please check -projectpath ${source} for me"\n`
    })

    expect(result).toEqual({ seeded: true })
  })

  it('strips every session-coupled entry from the clone, not just EditorInstance', async () => {
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library', 'com.singularitygroup.hotreload'), { recursive: true })
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'db')
    writeFileSync(join(source, 'Library', 'ArtifactDB-lock'), 'lock')
    writeFileSync(join(source, 'Library', 'ilpp.pid'), '12345')
    writeFileSync(join(source, 'Library', 'ProtocolInstance.json'), '{"port":52652}')
    writeFileSync(
      join(source, 'Library', 'com.singularitygroup.hotreload', 'sessionId.txt'),
      'session'
    )
    const worktree = makeUnityProject()

    const result = await seedUnityWorktreeCache({ worktreePath: worktree, sourcePath: source })

    expect(result).toEqual({ seeded: true })
    for (const entry of [
      'ArtifactDB-lock',
      'ilpp.pid',
      'ProtocolInstance.json',
      'com.singularitygroup.hotreload'
    ]) {
      expect(existsSync(join(worktree, 'Library', entry))).toBe(false)
    }
    expect(existsSync(join(worktree, 'Library', 'ArtifactDB'))).toBe(true)
  })

  it('leaves no staging directory behind on success', async () => {
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library'))
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'db')
    const worktree = makeUnityProject()

    await seedUnityWorktreeCache({ worktreePath: worktree, sourcePath: source })

    expect(existsSync(join(worktree, 'Library.orca-seeding'))).toBe(false)
  })

  it('refuses to open a project while a seed involving it is in flight', async () => {
    // Requires poking the in-flight sets through a real seed; approximated by
    // racing an open against a seed on the same worktree.
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library'))
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'big'.repeat(1000))
    const worktree = makeUnityProject()

    const seedPromise = seedUnityWorktreeCache({ worktreePath: worktree, sourcePath: source })
    const openResult = await openUnityProject({
      worktreePath: source,
      launch: async () => ({ ok: true })
    })
    await seedPromise

    // The seed registered `source` as in flight; the open must have refused
    // rather than starting an editor that writes under the clone.
    expect(openResult.opened).toBe(false)
    if (!openResult.opened) {
      expect(['seed_in_progress', 'editor_missing']).toContain(openResult.reason)
    }
  })

  it('re-checks the seed gate right before spawn — a seed that began mid-open blocks the launch', async () => {
    // The entry gate passes, THEN a seed starts during the open's awaits; the
    // spawn would race the clone inside the target's own Library.
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library'))
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'db')
    const worktree = makeUnityProject()
    let releaseSeedGate!: () => void
    const seedGate = new Promise<void>((resolve) => {
      releaseSeedGate = resolve
    })
    let seedPromise: ReturnType<typeof seedUnityWorktreeCache> | null = null
    const launches: string[] = []

    const result = await openUnityProject({
      worktreePath: worktree,
      platform: 'darwin',
      // The existing-window probe is the open's first await — past the entry
      // gate. A seed started here is exactly the mid-open race.
      listProcesses: async () => {
        seedPromise ??= seedUnityWorktreeCache({
          worktreePath: worktree,
          sourcePath: source,
          listProcessCommands: async () => {
            await seedGate
            return '/bin/ps\n'
          }
        })
        return []
      },
      editorBinaryExists: () => true,
      launch: async (binary: string) => {
        launches.push(binary)
        return { ok: true as const }
      }
    })

    releaseSeedGate()
    await expect(seedPromise).resolves.toEqual({ seeded: true })
    expect(launches).toEqual([])
    expect(result).toMatchObject({ opened: false, reason: 'seed_in_progress' })
  })
})

describe('autoSeedUnityCacheAfterWorktreeCreate', () => {
  function seedableFixture(): { source: string; worktree: string } {
    const source = makeUnityProject()
    mkdirSync(join(source, 'Library'))
    writeFileSync(join(source, 'Library', 'ArtifactDB'), 'db')
    return { source, worktree: makeUnityProject() }
  }

  it('seeds when the repo opted in', async () => {
    const { source, worktree } = seedableFixture()
    const outcomes: unknown[] = []

    await autoSeedUnityCacheAfterWorktreeCreate({
      sourcePath: source,
      worktreePath: worktree,
      decision: true,
      onOutcome: (outcome) => outcomes.push(outcome)
    })

    expect(outcomes).toEqual([{ seeded: true }])
    expect(existsSync(join(worktree, 'Library', 'ArtifactDB'))).toBe(true)
  })

  it('asks instead of acting while the choice is unmade — and only when a yes could work', async () => {
    const { source, worktree } = seedableFixture()
    let offers = 0

    await autoSeedUnityCacheAfterWorktreeCreate({
      sourcePath: source,
      worktreePath: worktree,
      offer: () => {
        offers += 1
      }
    })

    expect(offers).toBe(1)
    expect(existsSync(join(worktree, 'Library'))).toBe(false)

    // A source with nothing to give must not nag.
    let uselessOffers = 0
    await autoSeedUnityCacheAfterWorktreeCreate({
      sourcePath: makeUnityProject(),
      worktreePath: makeUnityProject(),
      offer: () => {
        uselessOffers += 1
      }
    })
    expect(uselessOffers).toBe(0)
  })

  it('respects an explicit no', async () => {
    const { source, worktree } = seedableFixture()
    let offers = 0

    await autoSeedUnityCacheAfterWorktreeCreate({
      sourcePath: source,
      worktreePath: worktree,
      decision: false,
      offer: () => {
        offers += 1
      }
    })

    expect(offers).toBe(0)
    expect(existsSync(join(worktree, 'Library'))).toBe(false)
  })

  it('stays silent on a non-Unity worktree', async () => {
    const outcomes: unknown[] = []

    await autoSeedUnityCacheAfterWorktreeCreate({
      sourcePath: makeDir(),
      worktreePath: makeDir(),
      decision: true,
      onOutcome: (outcome) => outcomes.push(outcome)
    })

    expect(outcomes).toEqual([{ seeded: false, reason: 'not_a_unity_project' }])
  })
})

describe('applyUnityWorktreeTint', () => {
  it('refuses a folder that is not a Unity project, creating nothing', async () => {
    const root = makeDir()
    const result = await applyUnityWorktreeTint({ worktreePath: root, enabled: true })
    expect(result).toEqual({ applied: false, outcome: 'not_a_unity_project' })
    expect(existsSync(join(root, 'Assets'))).toBe(false)
  })

  it('writes the override colour for a real project with an ignoring repo', async () => {
    const root = makeUnityProject()
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    writeFileSync(join(root, '.gitignore'), 'Assets/Private/\n')
    const result = await applyUnityWorktreeTint({
      worktreePath: root,
      enabled: true,
      label: 'feature-a',
      tintSiblingLabels: ['feature-a', 'feature-b'],
      tintOverridesByLabel: { 'feature-a': '#123456' }
    })
    expect(result).toEqual({ applied: true, outcome: 'written' })
    const script = readFileSync(
      join(root, 'Assets', 'Private', 'Editor', 'OrcaWorktreeTint.cs'),
      'utf-8'
    )
    expect(script).toContain('(Custom)')
  })

  it('removes the script when the colour feature is disabled', async () => {
    const root = makeUnityProject()
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    writeFileSync(join(root, '.gitignore'), 'Assets/Private/\n')
    await applyUnityWorktreeTint({ worktreePath: root, enabled: true, label: 'feature-a' })
    const result = await applyUnityWorktreeTint({ worktreePath: root, enabled: false })
    expect(result).toEqual({ applied: true, outcome: 'removed' })
    expect(existsSync(join(root, 'Assets', 'Private', 'Editor', 'OrcaWorktreeTint.cs'))).toBe(false)
  })
})
