import { mkdtemp, mkdir, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { markFirebaseDesktopJsonUpToDate } from './unity-firebase-config-timestamps'

let project: string
const streaming = () => join(project, 'Assets', 'StreamingAssets')

async function writeAt(path: string, content: string, mtime: Date): Promise<void> {
  await writeFile(path, content)
  await utimes(path, mtime, mtime)
}

const CHECKOUT = new Date('2026-08-19T22:08:49.135Z')

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'fb-ts-'))
  await mkdir(streaming(), { recursive: true })
})

describe('markFirebaseDesktopJsonUpToDate', () => {
  it('bumps a byte-identical generated file clearly past its source', async () => {
    await writeAt(join(streaming(), 'google-services.json'), '{"cfg":1}', CHECKOUT)
    await writeAt(join(streaming(), 'google-services-desktop.json'), '{"cfg":1}', CHECKOUT)

    expect(await markFirebaseDesktopJsonUpToDate(project)).toBe(true)

    const output = await stat(join(streaming(), 'google-services-desktop.json'))
    const source = await stat(join(streaming(), 'google-services.json'))
    expect(output.mtimeMs).toBeGreaterThanOrEqual(source.mtimeMs + 2_000)
  })

  it('never masks a legitimate regeneration (content differs)', async () => {
    await writeAt(join(streaming(), 'google-services.json'), '{"cfg":2}', CHECKOUT)
    await writeAt(join(streaming(), 'google-services-desktop.json'), '{"cfg":1}', CHECKOUT)

    expect(await markFirebaseDesktopJsonUpToDate(project)).toBe(false)

    const output = await stat(join(streaming(), 'google-services-desktop.json'))
    expect(Math.abs(output.mtimeMs - CHECKOUT.getTime())).toBeLessThan(5)
  })

  it('checks the Assets-root source location too', async () => {
    await writeAt(join(project, 'Assets', 'google-services.json'), '{"cfg":1}', CHECKOUT)
    await writeAt(join(streaming(), 'google-services-desktop.json'), '{"cfg":1}', CHECKOUT)

    expect(await markFirebaseDesktopJsonUpToDate(project)).toBe(true)
  })

  it('is a no-op without a generated file or without any source', async () => {
    expect(await markFirebaseDesktopJsonUpToDate(project)).toBe(false)

    await writeAt(join(streaming(), 'google-services-desktop.json'), '{"cfg":1}', CHECKOUT)
    expect(await markFirebaseDesktopJsonUpToDate(project)).toBe(false)
  })

  it('leaves an already-newer generated file untouched', async () => {
    const newer = new Date(CHECKOUT.getTime() + 60_000)
    await writeAt(join(streaming(), 'google-services.json'), '{"cfg":1}', CHECKOUT)
    await writeAt(join(streaming(), 'google-services-desktop.json'), '{"cfg":1}', newer)

    expect(await markFirebaseDesktopJsonUpToDate(project)).toBe(false)

    const output = await stat(join(streaming(), 'google-services-desktop.json'))
    expect(Math.abs(output.mtimeMs - newer.getTime())).toBeLessThan(5)
  })
})
