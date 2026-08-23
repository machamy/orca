import { describe, expect, it, vi } from 'vitest'
import { createDefaultSwitchCompletionGate } from './default-worktree-switch-completion-gate'

describe('createDefaultSwitchCompletionGate', () => {
  it('holds the marker until every side has settled', () => {
    const release = vi.fn()
    const gate = createDefaultSwitchCompletionGate(['repo::/a', 'repo::/b'], release)

    gate.complete('repo::/a')
    expect(release).not.toHaveBeenCalled()

    gate.complete('repo::/b')
    expect(release).toHaveBeenCalledOnce()
  })

  it('ignores a side reporting twice, so one side cannot release the other', () => {
    const release = vi.fn()
    const gate = createDefaultSwitchCompletionGate(['repo::/a', 'repo::/b'], release)

    gate.complete('repo::/a')
    gate.complete('repo::/a')

    expect(release).not.toHaveBeenCalled()
  })

  it('releases immediately when there is nothing to wait for', () => {
    const release = vi.fn()

    createDefaultSwitchCompletionGate([], release)

    expect(release).toHaveBeenCalledOnce()
  })
})

describe('the gate cannot pin the flow open', () => {
  it('releases on the fallback when no side ever reports', () => {
    vi.useFakeTimers()
    try {
      const release = vi.fn()
      createDefaultSwitchCompletionGate(['repo::/a', 'repo::/b'], release, {
        fallbackAfterMs: 105_000
      })

      vi.advanceTimersByTime(104_999)
      expect(release).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(release).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not release twice when both the reports and the fallback land', () => {
    vi.useFakeTimers()
    try {
      const release = vi.fn()
      const gate = createDefaultSwitchCompletionGate(['repo::/a'], release, {
        fallbackAfterMs: 1_000
      })

      gate.complete('repo::/a')
      vi.advanceTimersByTime(2_000)

      expect(release).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
