import { afterEach, describe, expect, it } from 'vitest'
import { parseClaudeStatusLineModelBody } from '../../../../shared/claude-statusline-model-badge'
import { readAgentModelBadge } from './agent-model-badge-reading'
import {
  readAgentModelBadgeStatusLine,
  recordAgentModelBadgeStatusLineForTests
} from './agent-model-badge-statusline-feed'

afterEach(() => {
  recordAgentModelBadgeStatusLineForTests(null)
})

describe('statusline model/effort feed', () => {
  it('parses only bounded fields for a named pane', () => {
    expect(parseClaudeStatusLineModelBody({ paneKey: 'p', model: ' Opus 5 ', effort: '' })).toEqual(
      {
        paneKey: 'p',
        model: 'Opus 5',
        effort: null
      }
    )
    expect(parseClaudeStatusLineModelBody({ model: 'Opus 5' })).toBeNull()
    expect(parseClaudeStatusLineModelBody({ paneKey: 'p' })).toBeNull()
    expect(parseClaudeStatusLineModelBody({ paneKey: 'p', model: 'x'.repeat(500) })).toBeNull()
  })

  it('outranks the hook-reported model once the statusline reports a switch', () => {
    recordAgentModelBadgeStatusLineForTests({
      paneKey: 'tab:leaf',
      model: 'Sonnet 5',
      effort: 'low'
    })
    const live = readAgentModelBadgeStatusLine('tab:leaf')
    const reading = readAgentModelBadge({
      agent: 'claude',
      reportedModel: live?.model ?? 'Opus 5',
      reportedEffort: live?.effort ?? 'high'
    })
    expect(reading).toMatchObject({ observed: true })
    expect(reading?.modelLabel).toContain('Sonnet')
    expect(readAgentModelBadgeStatusLine('other')).toBeUndefined()
  })
})
