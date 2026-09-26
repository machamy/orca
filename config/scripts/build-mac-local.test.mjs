import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLocalBuildVersion, readForkUpstreamRelease } from './build-mac-local.mjs'

describe('createLocalBuildVersion', () => {
  it('creates unique valid prerelease versions without changing the release base', () => {
    expect(createLocalBuildVersion('1.4.159-rc.0', 123456, 'abc123')).toBe(
      '1.4.159-rc.0.local.123456.abc123'
    )
    expect(createLocalBuildVersion('1.4.159', 123456, 'abc123')).toBe('1.4.159-local.123456.abc123')
  })

  it('sanitizes commit identifiers', () => {
    expect(createLocalBuildVersion('1.0.0', 1, 'abc/def')).toBe('1.0.0-local.1.abcdef')
  })

  it('stacks the fork revision on the upstream base when provided', () => {
    expect(createLocalBuildVersion('1.4.169-rc.0', 123456, 'abc123', '1')).toBe(
      '1.4.169-rc.0.machamy.1.local.123456.abc123'
    )
    expect(createLocalBuildVersion('1.4.169', 123456, 'abc123', '2')).toBe(
      '1.4.169-machamy.2.local.123456.abc123'
    )
    // Absent/blank fork rev keeps upstream's plain scheme.
    expect(createLocalBuildVersion('1.0.0', 1, 'abc', null)).toBe('1.0.0-local.1.abc')
    expect(createLocalBuildVersion('1.0.0', 1, 'abc', '')).toBe('1.0.0-local.1.abc')
  })
})

describe('readForkUpstreamRelease', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fork-upstream-release-'))
  const at = (content) => {
    const path = join(dir, `release-${Math.random().toString(36).slice(2)}`)
    writeFileSync(path, content)
    return path
  }

  it('labels the build with the tracked upstream release', () => {
    expect(readForkUpstreamRelease(at('1.4.212\n'))).toBe('1.4.212')
    expect(createLocalBuildVersion(readForkUpstreamRelease(at('1.4.212')), 1, 'abc123', '15')).toBe(
      '1.4.212-machamy.15.local.1.abc123'
    )
  })

  it('falls back (null) when the file is missing or not a plain release', () => {
    expect(readForkUpstreamRelease(join(dir, 'missing'))).toBeNull()
    expect(readForkUpstreamRelease(at('1.4.212-rc.0'))).toBeNull()
    expect(readForkUpstreamRelease(at('latest'))).toBeNull()
  })
})
