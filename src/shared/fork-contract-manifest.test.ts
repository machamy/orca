import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  FORK_ADDED_TESTS,
  FORK_CARRYING_TESTS
  // Why the ts-ignore-free .mjs import works: vitest transforms it like any module.
} from '../../config/fork-contract-tests.mjs'

/**
 * A merge that deletes or renames a contract file must fail HERE, loudly —
 * otherwise the fork gate silently shrinks and a feature loses its regression
 * net without anyone noticing. Fix by re-transplanting the fork cases into the
 * successor file and updating `config/fork-contract-tests.mjs`.
 */
describe('fork contract manifest', () => {
  it('every fork-added contract test still exists', () => {
    const missing = FORK_ADDED_TESTS.filter((path: string) => !existsSync(path))
    expect(missing).toEqual([])
  })

  it('every fork-carrying upstream test still exists', () => {
    const missing = FORK_CARRYING_TESTS.filter((path: string) => !existsSync(path))
    expect(missing).toEqual([])
  })

  it('lists no duplicates', () => {
    const all = [...FORK_ADDED_TESTS, ...FORK_CARRYING_TESTS]
    expect(new Set(all).size).toBe(all.length)
  })
})
