import { describe, expect, it } from 'vitest'
import { getDefaultSettings } from './constants'

describe('getDefaultSettings (fork defaults)', () => {
  it('keeps the browser markdown editor handoff enabled by default', () => {
    expect(getDefaultSettings('/tmp').browserMarkdownEditorHandoff).toBe(true)
  })
})
