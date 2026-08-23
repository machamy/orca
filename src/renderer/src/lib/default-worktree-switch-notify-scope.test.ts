import { describe, expect, it } from 'vitest'
import { resolveDefaultSwitchNotifyTargets } from './default-worktree-switch-notify-scope'

const IDS = { sourceWorktreeId: 'repo::/selected', currentDefaultWorktreeId: 'repo::/repo' }

describe('resolveDefaultSwitchNotifyTargets', () => {
  it('tells both sides when asked to', () => {
    expect(resolveDefaultSwitchNotifyTargets({ scope: 'both', ...IDS })).toHaveLength(2)
  })

  it('sends the promoted branch its note at the repo default path', () => {
    // The swap is in place: whatever rode the promoted branch is now sitting at
    // the repo default path, not at the worktree the user selected.
    expect(resolveDefaultSwitchNotifyTargets({ scope: 'promoted', ...IDS })).toEqual([
      'repo::/repo'
    ])
  })

  it('sends the demoted branch its note at the selected worktree', () => {
    expect(resolveDefaultSwitchNotifyTargets({ scope: 'demoted', ...IDS })).toEqual([
      'repo::/selected'
    ])
  })
})
