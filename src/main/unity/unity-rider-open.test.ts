import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  copyUnitySolutionFiles,
  findRiderAppPath,
  openUnityProjectInRider
} from './unity-rider-open'

async function makeUnityProject(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${name}-`))
  await mkdir(join(root, 'ProjectSettings'), { recursive: true })
  await writeFile(join(root, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.0.1')
  return root
}

const okLaunch = () => {
  const calls: { binary: string; argv: string[] }[] = []
  const launch = async (binary: string, argv: string[]): Promise<{ ok: true }> => {
    calls.push({ binary, argv })
    return { ok: true }
  }
  return { calls, launch }
}

describe('findRiderAppPath', () => {
  it('is null off macOS regardless of installs', () => {
    expect(findRiderAppPath('win32', () => true)).toBeNull()
  })

  it('prefers /Applications and falls back to the Toolbox location', () => {
    expect(findRiderAppPath('darwin', (p) => p === '/Applications/Rider.app')).toBe(
      '/Applications/Rider.app'
    )
    expect(findRiderAppPath('darwin', (p) => p !== '/Applications/Rider.app')).toBe(
      join(homedir(), 'Applications', 'Rider.app')
    )
    expect(findRiderAppPath('darwin', () => false)).toBeNull()
  })
})

describe('copyUnitySolutionFiles', () => {
  let source: string
  let worktree: string
  beforeEach(async () => {
    source = await makeUnityProject('rider-src')
    worktree = await makeUnityProject('rider-wt')
  })

  it('copies sln renamed to the worktree folder plus every csproj', async () => {
    await writeFile(join(source, `${basename(source)}.sln`), 'Project("Assembly-CSharp.csproj")')
    await writeFile(join(source, 'Assembly-CSharp.csproj'), '<Project/>')
    await writeFile(join(source, 'Assembly-CSharp-Editor.csproj'), '<Project/>')

    expect(await copyUnitySolutionFiles({ sourcePath: source, worktreePath: worktree })).toBe(true)

    expect(await readFile(join(worktree, `${basename(worktree)}.sln`), 'utf-8')).toContain(
      'Assembly-CSharp.csproj'
    )
    const entries = await readdir(worktree)
    expect(entries).toContain('Assembly-CSharp.csproj')
    expect(entries).toContain('Assembly-CSharp-Editor.csproj')
  })

  it('does nothing when the worktree already has a solution', async () => {
    await writeFile(join(source, 'src.sln'), 'source')
    await writeFile(join(worktree, 'mine.sln'), 'mine')

    expect(await copyUnitySolutionFiles({ sourcePath: source, worktreePath: worktree })).toBe(false)
    expect(await readFile(join(worktree, 'mine.sln'), 'utf-8')).toBe('mine')
  })

  it('does nothing when the source has no solution', async () => {
    expect(await copyUnitySolutionFiles({ sourcePath: source, worktreePath: worktree })).toBe(false)
  })

  it('never overwrites a csproj the worktree already owns', async () => {
    await writeFile(join(source, 'src.sln'), '')
    await writeFile(join(source, 'Assembly-CSharp.csproj'), 'source-version')
    await writeFile(join(worktree, 'Assembly-CSharp.csproj'), 'worktree-version')

    expect(await copyUnitySolutionFiles({ sourcePath: source, worktreePath: worktree })).toBe(true)
    expect(await readFile(join(worktree, 'Assembly-CSharp.csproj'), 'utf-8')).toBe(
      'worktree-version'
    )
  })

  it('repairs a partial copy: csproj without sln retries instead of skipping', async () => {
    // A prior failed copy leaves csproj files but no sln (sln is written last);
    // the guard keys on the sln, so the next attempt completes the set.
    await writeFile(join(source, 'src.sln'), '')
    await writeFile(join(source, 'Assembly-CSharp.csproj'), '<Project/>')
    await writeFile(join(worktree, 'Assembly-CSharp.csproj'), '<Project/>')

    expect(await copyUnitySolutionFiles({ sourcePath: source, worktreePath: worktree })).toBe(true)
    expect(await readdir(worktree)).toContain(`${basename(worktree)}.sln`)
  })
})

describe('openUnityProjectInRider', () => {
  it('refuses a non-Unity folder', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'rider-plain-'))
    const result = await openUnityProjectInRider({
      worktreePath: plain,
      riderAppPath: '/Applications/Rider.app'
    })
    expect(result).toEqual({ opened: false, reason: 'not_a_unity_project' })
  })

  it('reports rider_missing without launching anything', async () => {
    const worktree = await makeUnityProject('rider-none')
    const { calls, launch } = okLaunch()
    const result = await openUnityProjectInRider({
      worktreePath: worktree,
      riderAppPath: null,
      launch
    })
    expect(result).toEqual({ opened: false, reason: 'rider_missing' })
    expect(calls).toHaveLength(0)
  })

  it('opens an existing solution, preferring the folder-named one', async () => {
    const worktree = await makeUnityProject('rider-sln')
    await writeFile(join(worktree, 'other.sln'), '')
    await writeFile(join(worktree, `${basename(worktree)}.sln`), '')
    const { calls, launch } = okLaunch()

    const result = await openUnityProjectInRider({
      worktreePath: worktree,
      riderAppPath: '/Applications/Rider.app',
      launch
    })

    expect(result).toEqual({ opened: true, target: 'solution' })
    expect(calls[0]).toEqual({
      binary: '/usr/bin/open',
      argv: ['-a', '/Applications/Rider.app', join(worktree, `${basename(worktree)}.sln`)]
    })
  })

  it('seeds the solution from the source before opening', async () => {
    const source = await makeUnityProject('rider-donor')
    const worktree = await makeUnityProject('rider-fresh')
    await writeFile(join(source, 'donor.sln'), '')
    await writeFile(join(source, 'Assembly-CSharp.csproj'), '<Project/>')
    const { calls, launch } = okLaunch()

    const result = await openUnityProjectInRider({
      worktreePath: worktree,
      sourcePath: source,
      riderAppPath: '/Applications/Rider.app',
      launch
    })

    expect(result).toEqual({ opened: true, target: 'solution' })
    expect(calls[0]?.argv[2]).toBe(join(worktree, `${basename(worktree)}.sln`))
    expect(await readdir(worktree)).toContain('Assembly-CSharp.csproj')
  })

  it('falls back to the folder when no solution exists anywhere', async () => {
    const source = await makeUnityProject('rider-bare-src')
    const worktree = await makeUnityProject('rider-bare-wt')
    const { calls, launch } = okLaunch()

    const result = await openUnityProjectInRider({
      worktreePath: worktree,
      sourcePath: source,
      riderAppPath: '/Applications/Rider.app',
      launch
    })

    expect(result).toEqual({ opened: true, target: 'folder' })
    expect(calls[0]?.argv[2]).toBe(worktree)
  })

  it('surfaces a launch failure with its detail', async () => {
    const worktree = await makeUnityProject('rider-fail')
    await writeFile(join(worktree, 'x.sln'), '')
    const result = await openUnityProjectInRider({
      worktreePath: worktree,
      riderAppPath: '/Applications/Rider.app',
      launch: async () => ({ ok: false, detail: 'EACCES' })
    })
    expect(result).toEqual({ opened: false, reason: 'launch_failed', detail: 'EACCES' })
  })
})
