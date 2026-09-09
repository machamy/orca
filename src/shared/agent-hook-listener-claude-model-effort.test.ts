/**
 * Fork: Claude puts the model and the turn's reasoning effort in every tool-use
 * hook, but the shared normalizer keeps only string fields — so the object shapes
 * were dropped and a Claude pane's status row carried neither. These pin the
 * ingestion end of that fix; the field reader's own edge cases live beside it.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  createHookListenerState,
  type HookListenerState
} from './agent-hook-listener/listener-state'
import { normalizeHookPayload } from './agent-hook-listener'
import { PANE_KEY } from './agent-hook-listener-test-harness'

function claudeHook(state: HookListenerState, payload: Record<string, unknown>) {
  return normalizeHookPayload(state, 'claude', { paneKey: PANE_KEY, payload }, 'production')
}

describe('Claude hook model and effort ingestion', () => {
  let state: HookListenerState

  beforeEach(() => {
    state = createHookListenerState()
  })

  it('carries the model and effort a tool-use hook reports', () => {
    const event = claudeHook(state, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_use_id: 'toolu_1',
      model: { id: 'claude-opus-5-20260114', display_name: 'Opus 5' },
      effort: { level: 'high' }
    })

    expect(event?.payload).toMatchObject({ agentType: 'claude', model: 'Opus 5', effort: 'high' })
  })

  it('tracks a mid-session model switch instead of pinning the startup value', () => {
    claudeHook(state, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_use_id: 'toolu_1',
      model: { id: 'claude-opus-5', display_name: 'Opus 5' },
      effort: { level: 'high' }
    })
    const afterSwitch = claudeHook(state, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_use_id: 'toolu_2',
      model: { id: 'claude-sonnet-5', display_name: 'Sonnet 5' },
      effort: { level: 'medium' }
    })

    expect(afterSwitch?.payload).toMatchObject({ model: 'Sonnet 5', effort: 'medium' })
  })

  it('reports no effort for a hook that carries none', () => {
    // Session-lifecycle events omit it, as do models without the parameter.
    const event = claudeHook(state, {
      hook_event_name: 'SessionStart',
      source: 'startup',
      session_id: '44444444-4444-4444-8444-444444444444',
      model: { id: 'claude-haiku-4-5', display_name: 'Haiku 4.5' }
    })

    expect(event?.payload.effort).toBeUndefined()
  })
})
