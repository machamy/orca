import { describe, expect, it } from 'vitest'
import { dropInheritedPaneEnv } from './inherited-pane-env'

describe('dropInheritedPaneEnv', () => {
  it('drops the session env when Orca is restarted from an agent pane', () => {
    const env: NodeJS.ProcessEnv = {
      HOME: '/Users/me',
      PATH: '/usr/bin',
      CLAUDECODE: '1',
      CLAUDE_CONFIG_DIR: '/Users/me/.claude2',
      CLAUDE_CODE_SESSION_ID: 'session',
      ORCA_PANE_KEY: 'pane',
      ORCA_USER_DATA_PATH: '/Users/me/Library/Application Support/orca',
      ORCA_CLAUDE_CONFIG_DIR: '/Users/me/.claude',
      ORCA_BACKGROUND_LAUNCH: '1',
      ORCA_E2E_USER_DATA_DIR: '/tmp/profile'
    }

    dropInheritedPaneEnv(env)

    expect(env).toEqual({
      HOME: '/Users/me',
      PATH: '/usr/bin',
      ORCA_BACKGROUND_LAUNCH: '1',
      ORCA_E2E_USER_DATA_DIR: '/tmp/profile'
    })
  })

  it('keeps a Claude home the user set outside any pane', () => {
    const env: NodeJS.ProcessEnv = { CLAUDE_CONFIG_DIR: '/Users/me/.claude-work' }

    dropInheritedPaneEnv(env)

    expect(env.CLAUDE_CONFIG_DIR).toBe('/Users/me/.claude-work')
  })
})
