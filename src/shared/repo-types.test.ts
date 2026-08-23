import { describe, expect, it } from 'vitest'

import { resolveUnitySidebarTintMode } from './repo-types'

describe('resolveUnitySidebarTintMode', () => {
  it('reads records written while the setting was a boolean', () => {
    expect(resolveUnitySidebarTintMode(true)).toBe('bar')
    // The toggle era's "don't show" survives the default flip.
    expect(resolveUnitySidebarTintMode(false)).toBe('off')
  })

  it('treats an unset setting as the bar', () => {
    expect(resolveUnitySidebarTintMode(undefined)).toBe('bar')
    expect(resolveUnitySidebarTintMode(null)).toBe('bar')
  })

  it('passes the four modes through', () => {
    for (const mode of ['off', 'bar', 'wash', 'chip'] as const) {
      expect(resolveUnitySidebarTintMode(mode)).toBe(mode)
    }
  })

  it('keeps an explicit off off', () => {
    expect(resolveUnitySidebarTintMode('off')).toBe('off')
  })

  it('falls back to the default for anything else persisted', () => {
    expect(resolveUnitySidebarTintMode('BAR')).toBe('bar')
    expect(resolveUnitySidebarTintMode('stripe')).toBe('bar')
    expect(resolveUnitySidebarTintMode(1)).toBe('bar')
    expect(resolveUnitySidebarTintMode(0)).toBe('bar')
    expect(resolveUnitySidebarTintMode({ mode: 'bar' })).toBe('bar')
  })
})
