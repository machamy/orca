import { describe, expect, it } from 'vitest'
import { readClaudeEffortField, readClaudeModelField } from './claude-model-effort-fields'

describe('readClaudeModelField', () => {
  it('reads the object shape Claude actually sends', () => {
    // The regression this guards: the shared normalizer keeps only string fields,
    // so this object was dropped and a Claude pane's status row carried no model.
    expect(
      readClaudeModelField({ model: { id: 'claude-opus-5-20260114', display_name: 'Opus 5' } })
    ).toBe('Opus 5')
  })

  it('prefers the display name over the dated id', () => {
    expect(
      readClaudeModelField({ model: { id: 'claude-sonnet-5', display_name: 'Sonnet 5' } })
    ).toBe('Sonnet 5')
  })

  it('falls back to the id when no display name is given', () => {
    expect(readClaudeModelField({ model: { id: 'claude-haiku-4-5' } })).toBe('claude-haiku-4-5')
  })

  it('accepts a bare string in case the shape ever flattens', () => {
    expect(readClaudeModelField({ model: 'Opus 5' })).toBe('Opus 5')
  })

  it('reports nothing rather than an empty label', () => {
    expect(readClaudeModelField({})).toBeUndefined()
    expect(readClaudeModelField({ model: null })).toBeUndefined()
    expect(readClaudeModelField({ model: { display_name: '   ' } })).toBeUndefined()
  })
})

describe('readClaudeEffortField', () => {
  it('reads the level Claude applied to this turn', () => {
    expect(readClaudeEffortField({ effort: { level: 'high' } })).toBe('high')
  })

  it('accepts a bare string', () => {
    expect(readClaudeEffortField({ effort: 'xhigh' })).toBe('xhigh')
  })

  it('reports nothing on hooks that carry no effort', () => {
    // Session-lifecycle hooks and models without the parameter omit it; absence
    // means "not reported", never "no effort".
    expect(readClaudeEffortField({})).toBeUndefined()
    expect(readClaudeEffortField({ effort: {} })).toBeUndefined()
    expect(readClaudeEffortField({ effort: null })).toBeUndefined()
  })
})
