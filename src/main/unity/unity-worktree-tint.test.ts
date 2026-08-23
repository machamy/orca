import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { pickUnityWorktreeTint, syncUnityWorktreeTint } from './unity-worktree-tint'

let project: string
const scriptPath = (): string => join(project, 'Assets', 'Private', 'Editor', 'OrcaWorktreeTint.cs')

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'unity-tint-'))
  // The writer refuses to touch a path git would track, so the fixture is a
  // real repo that ignores Assets/Private — exactly the target repos' setup.
  execFileSync('git', ['init', '--quiet'], { cwd: project })
  await writeFile(join(project, '.gitignore'), 'Assets/Private/\n')
})

describe('pickUnityWorktreeTint', () => {
  it('is stable for a name and spreads different names across the palette', () => {
    expect(pickUnityWorktreeTint('feature-a')).toEqual(pickUnityWorktreeTint('feature-a'))
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(
      (name) => pickUnityWorktreeTint(name).name
    )
    expect(new Set(names).size).toBeGreaterThan(4)
  })

  it('returns a palette colour with matching rgb', () => {
    const tint = pickUnityWorktreeTint('feature-a')
    expect(tint.hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(tint.rgb.r).toBeCloseTo(Number.parseInt(tint.hex.slice(1, 3), 16) / 255, 5)
  })

  it('gives every sibling a distinct colour up to the palette size', () => {
    const siblings = [
      'dev-2',
      'worktree-1',
      'worktree-2',
      'worktree-3',
      'worktree-4',
      'worktree-5',
      'worktree-6',
      'worktree-7',
      'worktree-8',
      'main-2'
    ]
    const assigned = siblings.map((name) => pickUnityWorktreeTint(name, siblings).name)
    expect(new Set(assigned).size).toBe(siblings.length)
  })

  it('keeps an existing worktree colour when a new sibling appears', () => {
    const before = ['alpha', 'beta', 'gamma']
    const after = [...before, 'zulu']
    for (const name of before) {
      expect(pickUnityWorktreeTint(name, after).name).toBe(pickUnityWorktreeTint(name, before).name)
    }
  })

  it('keeps the toolbar fill dark so the light toolbar icons stay readable', () => {
    for (const name of ['a', 'feature-a', 'dev', 'feature-b']) {
      const { rgb, toolbarRgb } = pickUnityWorktreeTint(name)
      const luminance = (toolbarRgb.r + toolbarRgb.g + toolbarRgb.b) / 3
      expect(luminance).toBeLessThan(0.55)
      // Still visibly tinted rather than plain grey.
      expect(Math.abs(toolbarRgb.r - toolbarRgb.b)).toBeGreaterThan(Math.abs(rgb.r - rgb.b) * 0.2)
    }
  })
})

describe('syncUnityWorktreeTint', () => {
  it('refuses to write where git would track the file', async () => {
    await writeFile(join(project, '.gitignore'), '# nothing ignored\n')

    expect(await syncUnityWorktreeTint({ worktreePath: project, enabled: true })).toBe('skipped')
    await expect(readFile(scriptPath(), 'utf-8')).rejects.toThrow()
  })

  it('writes the script into the gitignored Assets/Private/Editor path', async () => {
    expect(await syncUnityWorktreeTint({ worktreePath: project, enabled: true })).toBe('written')

    const contents = await readFile(scriptPath(), 'utf-8')
    expect(contents).toContain('unity-editor-main-toolbar')
    expect(contents).toContain('UNITY_6000_3_OR_NEWER')
    // The label defaults to the worktree folder name.
    expect(contents).toContain(`"${project.split('/').pop()}"`)
  })

  it('is idempotent so an unchanged file never triggers a domain reload', async () => {
    await syncUnityWorktreeTint({ worktreePath: project, enabled: true })
    const first = await stat(scriptPath())
    expect(await syncUnityWorktreeTint({ worktreePath: project, enabled: true })).toBe('unchanged')
    expect((await stat(scriptPath())).mtimeMs).toBe(first.mtimeMs)
  })

  it('removes the script and its meta when disabled', async () => {
    await syncUnityWorktreeTint({ worktreePath: project, enabled: true })
    await writeFile(`${scriptPath()}.meta`, 'guid: 0')

    expect(await syncUnityWorktreeTint({ worktreePath: project, enabled: false })).toBe('removed')
    await expect(readFile(scriptPath(), 'utf-8')).rejects.toThrow()
    await expect(readFile(`${scriptPath()}.meta`, 'utf-8')).rejects.toThrow()
  })

  it('reports unchanged when disabling a worktree that never had it', async () => {
    expect(await syncUnityWorktreeTint({ worktreePath: project, enabled: false })).toBe('unchanged')
  })

  it('writes a manual override colour instead of the automatic one', async () => {
    await syncUnityWorktreeTint({
      worktreePath: project,
      enabled: true,
      label: 'feature-a',
      siblingLabels: ['feature-a', 'feature-b'],
      overridesByLabel: { 'feature-a': '#123456' }
    })
    const contents = await readFile(scriptPath(), 'utf-8')
    expect(contents).toContain('(Custom)')
    // #123456 → r=0x12/255
    expect(contents).toContain(`${(0x12 / 255).toFixed(4)}f`)
  })

  it('escapes a label that would break the C# string literal', async () => {
    await mkdir(join(project, 'Assets'), { recursive: true })
    await syncUnityWorktreeTint({
      worktreePath: project,
      enabled: true,
      label: 'we"ird\\name'
    })

    const contents = await readFile(scriptPath(), 'utf-8')
    expect(contents).toContain('"we\\"ird\\\\name"')
  })
})
