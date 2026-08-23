import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  resolveLocalSigningIdentity,
  signLocalMacApp,
  DEFAULT_LOCAL_IDENTITY
} = require('./sign-local-mac-app.cjs')

const identityList = (names) =>
  `${names.map((n, i) => `  ${i + 1}) ABCDEF${i} "${n}"`).join('\n')}\n     ${names.length} valid identities found\n`

describe('resolveLocalSigningIdentity', () => {
  it('uses the default identity when it is installed for codesigning', () => {
    expect(resolveLocalSigningIdentity(() => identityList([DEFAULT_LOCAL_IDENTITY]), {})).toBe(
      DEFAULT_LOCAL_IDENTITY
    )
  })

  it('prefers an explicitly requested identity', () => {
    expect(
      resolveLocalSigningIdentity(() => identityList(['My Signing Cert']), {
        ORCA_LOCAL_SIGN_IDENTITY: 'My Signing Cert'
      })
    ).toBe('My Signing Cert')
  })

  it('falls back to ad-hoc when no matching identity exists', () => {
    expect(resolveLocalSigningIdentity(() => identityList(['Someone Else']), {})).toBe('-')
  })

  it('falls back to ad-hoc when the keychain cannot be read', () => {
    expect(
      resolveLocalSigningIdentity(() => {
        throw new Error('no keychain')
      }, {})
    ).toBe('-')
  })
})

describe('signLocalMacApp', () => {
  it('seals the bundle with the resolved identity, then verifies it', () => {
    const calls = []
    const run = (bin, args) => {
      calls.push([bin, args])
      return args[0] === 'find-identity' ? identityList([DEFAULT_LOCAL_IDENTITY]) : ''
    }

    signLocalMacApp('/tmp/Orca.app', run, {})

    const codesign = calls.filter(([bin]) => bin === '/usr/bin/codesign')
    expect(codesign.at(0)?.[1]).toEqual([
      '--force',
      '--deep',
      '--sign',
      DEFAULT_LOCAL_IDENTITY,
      '/tmp/Orca.app'
    ])
    expect(codesign.at(1)?.[1]).toEqual(['--verify', '--deep', '--strict', '/tmp/Orca.app'])
  })

  it('still signs ad-hoc when no identity is installed', () => {
    const calls = []
    const run = (bin, args) => {
      calls.push([bin, args])
      return args[0] === 'find-identity' ? identityList([]) : ''
    }

    signLocalMacApp('/tmp/Orca.app', run, {})

    expect(calls.find(([bin]) => bin === '/usr/bin/codesign')?.[1]).toContain('-')
  })
})
