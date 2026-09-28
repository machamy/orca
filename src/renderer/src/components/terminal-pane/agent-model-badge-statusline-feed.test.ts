import { afterEach, describe, expect, it } from 'vitest'
import { parseClaudeStatusLineModelBody } from '../../../../shared/claude-statusline-model-badge'
import { readAgentModelBadge } from './agent-model-badge-reading'
import {
  ensureAgentModelBadgeStatusLineFeed,
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

  it('picks up reports that reached main before the badge subscribed', async () => {
    const pushed: ((report: {
      paneKey: string
      model: string | null
      effort: string | null
    }) => void)[] = []
    Object.assign(globalThis, {
      window: {
        api: {
          agentModelBadge: {
            onStatusLine: (callback: (typeof pushed)[number]) => {
              pushed.push(callback)
              return () => {}
            },
            snapshot: async () => [
              { paneKey: 'early', model: 'Opus 5.5', effort: 'xhigh' },
              { paneKey: 'live', model: 'stale', effort: 'low' }
            ]
          }
        }
      }
    })
    ensureAgentModelBadgeStatusLineFeed()
    // A live push that lands before the snapshot resolves must win over it.
    pushed[0]({ paneKey: 'live', model: 'Sonnet 5', effort: 'high' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(readAgentModelBadgeStatusLine('early')).toMatchObject({ model: 'Opus 5.5' })
    expect(readAgentModelBadgeStatusLine('live')).toMatchObject({ model: 'Sonnet 5' })
    Reflect.deleteProperty(globalThis, 'window')
  })
})
