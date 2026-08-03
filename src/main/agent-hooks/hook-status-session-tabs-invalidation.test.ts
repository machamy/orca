import { describe, expect, it } from 'vitest'
import {
  createHookStatusSessionTabsInvalidator,
  type HookStatusSessionTabsRow
} from './hook-status-session-tabs-invalidation'

const WORKING: HookStatusSessionTabsRow = {
  paneKey: 'tab:leaf',
  state: 'working',
  agentType: 'claude',
  prompt: 'fix the tests'
}

describe('createHookStatusSessionTabsInvalidator', () => {
  it('invalidates the first time a pane reports', () => {
    const changed = createHookStatusSessionTabsInvalidator()

    expect(changed(WORKING)).toBe(true)
  })

  it('stays quiet while the same status keeps being pinged', () => {
    const changed = createHookStatusSessionTabsInvalidator()
    changed(WORKING)

    expect(changed({ ...WORKING })).toBe(false)
  })

  it.each([
    ['state', { state: 'waiting' as const }],
    ['prompt', { prompt: 'ship it' }],
    ['agentType', { agentType: 'codex' }],
    ['toolName', { toolName: 'Bash' }],
    ['interactivePrompt', { interactivePrompt: '{"questions":[]}' }],
    ['interrupted', { interrupted: true }]
  ])('invalidates when %s changes', (_field, overrides) => {
    const changed = createHookStatusSessionTabsInvalidator()
    changed(WORKING)

    expect(changed({ ...WORKING, ...overrides })).toBe(true)
  })

  it('ignores resume-identity rows, which the provider-session path owns', () => {
    const changed = createHookStatusSessionTabsInvalidator()

    expect(changed({ ...WORKING, providerSessionOnly: true })).toBe(false)
  })

  it('tracks panes independently', () => {
    const changed = createHookStatusSessionTabsInvalidator()
    changed(WORKING)

    expect(changed({ ...WORKING, paneKey: 'tab:other' })).toBe(true)
    expect(changed({ ...WORKING })).toBe(false)
  })

  it('tracks an SSH-stamped pane like any other', () => {
    const changed = createHookStatusSessionTabsInvalidator()
    changed({ ...WORKING, connectionId: 'conn-1' })

    expect(changed({ ...WORKING, connectionId: 'conn-1' })).toBe(false)
    expect(changed({ ...WORKING, connectionId: 'conn-1', state: 'done' })).toBe(true)
  })

  it('re-arms a forgotten pane so an identical relaunch still invalidates', () => {
    const changed = createHookStatusSessionTabsInvalidator()
    changed(WORKING)
    changed.forgetPane(WORKING.paneKey)

    expect(changed({ ...WORKING })).toBe(true)
  })

  it("names an SSH host's panes so a disconnect can republish each of them", () => {
    const changed = createHookStatusSessionTabsInvalidator()
    changed({ ...WORKING, connectionId: 'conn-1' })
    changed({ ...WORKING, paneKey: 'tab:remote', connectionId: 'conn-1' })
    changed({ ...WORKING, paneKey: 'tab:local' })

    expect(changed.forgetConnection('conn-1').sort()).toEqual(['tab:leaf', 'tab:remote'])
    expect(changed({ ...WORKING, paneKey: 'tab:local' })).toBe(false)
  })
})
