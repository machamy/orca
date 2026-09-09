import { describe, expect, it } from 'vitest'
import { readAgentModelBadge } from './agent-model-badge-reading'

/** Minimum of Claude's startup frame the scraper needs: a header row it can
 *  recognise and a descriptor cell carrying the effort suffix. */
function claudeFrame(descriptor: string): string {
  return [
    '╭─── Claude Code v2.1.220 ──────────────────────────────╮',
    `│ ${descriptor} │`,
    '│ /private/tmp                                          │',
    '╰───────────────────────────────────────────────────────╯'
  ].join('\n')
}

describe('readAgentModelBadge', () => {
  it('prefers the reported row, which is the only source that tracks /model', () => {
    // The frame is printed once at startup and never redrawn, so after a
    // mid-session switch it names the model the session has left behind.
    expect(
      readAgentModelBadge({
        agent: 'claude',
        reportedModel: 'Sonnet 4.5',
        reportedEffort: 'medium',
        screen: claudeFrame('Opus with high effort · API Usage Billing'),
        persisted: { claude: { model: 'haiku' } }
      })
    ).toEqual({ modelLabel: 'Sonnet 4.5', effortLabel: 'Medium', observed: true })
  })

  it('drops the frame effort once the session has moved to another model', () => {
    // Showing `high` (the old model's level) beside the new model would state a
    // pairing the agent is not running.
    expect(
      readAgentModelBadge({
        agent: 'claude',
        reportedModel: 'Sonnet 4.5',
        screen: claudeFrame('Opus with high effort · API Usage Billing')
      })
    ).toEqual({ modelLabel: 'Sonnet 4.5', effortLabel: null, observed: true })
  })

  it('still reads the frame when the agent has reported nothing yet', () => {
    expect(
      readAgentModelBadge({
        agent: 'claude',
        screen: claudeFrame('Opus with high effort · API Usage Billing')
      })
    ).toEqual({ modelLabel: 'Opus', effortLabel: 'High', observed: true })
  })

  it('labels a reported effort even when the model is a display name', () => {
    // Hooks report "Opus 5", not the catalog id, so the level must still resolve.
    expect(
      readAgentModelBadge({ agent: 'claude', reportedModel: 'Opus 5', reportedEffort: 'xhigh' })
    ).toEqual({ modelLabel: 'Opus 5', effortLabel: 'Extra high', observed: true })
  })

  it('uses the reported model when the screen has no frame to read', () => {
    expect(
      readAgentModelBadge({
        agent: 'claude',
        reportedModel: 'sonnet',
        screen: 'a plain shell prompt\n$ ',
        persisted: undefined
      })
    ).toEqual({ modelLabel: 'Sonnet', effortLabel: null, observed: true })
  })

  it('shows the persisted launch pick unobserved — nothing confirmed it', () => {
    expect(
      readAgentModelBadge({
        agent: 'codex',
        screen: null,
        persisted: {
          codex: { model: 'gpt-5.5', valuesByModel: { 'gpt-5.5': { effort: 'xhigh' } } }
        }
      })
    ).toEqual({ modelLabel: 'GPT-5.5', effortLabel: 'Extra high', observed: false })
  })

  it('downgrades a reported model whose effort is only a launch pick', () => {
    // Why: the pair is what a launch resolves, so a confirmed model beside a
    // guessed effort still puts an unverified level on screen.
    expect(
      readAgentModelBadge({
        agent: 'codex',
        reportedModel: 'gpt-5.5',
        screen: null,
        persisted: { codex: { valuesByModel: { 'gpt-5.5': { effort: 'high' } } } }
      })
    ).toEqual({ modelLabel: 'GPT-5.5', effortLabel: 'High', observed: false })
  })

  it('keeps an id the catalog does not list rather than dropping the badge', () => {
    expect(
      readAgentModelBadge({ agent: 'codex', reportedModel: 'gpt-9-unreleased', screen: null })
    ).toEqual({ modelLabel: 'gpt-9-unreleased', effortLabel: null, observed: true })
  })

  it('renders nothing when no source names a model', () => {
    expect(readAgentModelBadge({ agent: 'claude', screen: null })).toBeNull()
    expect(readAgentModelBadge({ agent: 'codex', screen: null, persisted: {} })).toBeNull()
  })

  it('renders nothing for an agent with no model catalog', () => {
    expect(
      readAgentModelBadge({ agent: 'amp' as never, reportedModel: 'whatever', screen: null })
    ).toBeNull()
  })

  it('ignores a blank persisted model instead of showing an empty pill', () => {
    expect(
      readAgentModelBadge({ agent: 'codex', screen: null, persisted: { codex: { model: '   ' } } })
    ).toBeNull()
  })
})
