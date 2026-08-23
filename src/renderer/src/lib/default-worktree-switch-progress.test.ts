import { describe, expect, it } from 'vitest'
import {
  describeDefaultSwitchPhase,
  shouldShowDefaultSwitchStage,
  type DefaultSwitchPhase
} from './default-worktree-switch-progress'

const PHASES: DefaultSwitchPhase[] = [
  'waiting-for-agents',
  'sleeping',
  'swapping-branches',
  'restoring',
  'settling'
]

describe('describeDefaultSwitchPhase', () => {
  it('says something distinct for every stage', () => {
    const lines = PHASES.map((phase) => describeDefaultSwitchPhase({ phase }))

    expect(lines.every((line) => line.trim().length > 0)).toBe(true)
    expect(new Set(lines).size).toBe(PHASES.length)
  })

  it('names what the wait is blocked on', () => {
    // The whole point: a 45s wait that says only "moving agents" is
    // indistinguishable from a stuck switch.
    expect(
      describeDefaultSwitchPhase({ phase: 'waiting-for-agents', detail: 'T1-클로드' })
    ).toContain('T1-클로드')
    expect(describeDefaultSwitchPhase({ phase: 'waiting-for-agents' })).not.toContain('undefined')
  })

  it('names the worktree the branches are being exchanged with', () => {
    expect(describeDefaultSwitchPhase({ phase: 'swapping-branches', detail: 'skills' })).toContain(
      'skills'
    )
  })
})

describe('shouldShowDefaultSwitchStage', () => {
  const NOW = 1_000_000
  const STALE = 360_000

  it('shows the stage for a worktree the switch is moving', () => {
    const inFlight = { worktreeIds: ['repo::/a', 'repo::/b'], startedAt: NOW - 5_000 }

    expect(shouldShowDefaultSwitchStage(inFlight, 'repo::/a', STALE, NOW)).toBe(true)
    expect(shouldShowDefaultSwitchStage(inFlight, 'repo::/other', STALE, NOW)).toBe(false)
  })

  it('shows nothing when no switch is running', () => {
    expect(shouldShowDefaultSwitchStage(null, 'repo::/a', STALE, NOW)).toBe(false)
  })

  it('gives up on a switch that has been running longer than the staleness bound', () => {
    // A wedged flow must not pin a spinner on the card forever.
    const wedged = { worktreeIds: ['repo::/a'], startedAt: NOW - STALE - 1 }

    expect(shouldShowDefaultSwitchStage(wedged, 'repo::/a', STALE, NOW)).toBe(false)
  })

  it('still shows a switch that is slower than the old 30s window', () => {
    // The row used to vanish after 30s while the sweeps ran for 75s more, so a
    // healthy switch looked finished — and then finished again.
    const slow = { worktreeIds: ['repo::/a'], startedAt: NOW - 90_000 }

    expect(shouldShowDefaultSwitchStage(slow, 'repo::/a', STALE, NOW)).toBe(true)
  })
})

describe('the display marker must not act as a lock', () => {
  it('an unadmitted marker still shows a stage', () => {
    const pending = { worktreeIds: ['repo::/a'], startedAt: 1_000, admitted: false }

    expect(shouldShowDefaultSwitchStage(pending, 'repo::/a', 360_000, 1_500)).toBe(true)
  })
})

describe('claimDefaultSwitch owner semantics', () => {
  it('a display marker cannot displace a live admitted claim', async () => {
    const { useAppStore } = await import('@/store')
    const owner = useAppStore.getState().claimDefaultSwitch(['repo::/a'], { admitted: true })
    expect(owner).not.toBeNull()

    // Regression: the rival's display marker used to overwrite the winner's
    // claim on its first line, so readiness saw no switch in flight and let it
    // through — both flows slept and a tab ended up keyed under BOTH worktrees.
    const rival = useAppStore.getState().claimDefaultSwitch(['repo::/a'], { admitted: false })

    expect(rival).toBeNull()
    expect(useAppStore.getState().defaultSwitchInFlight?.admitted).toBe(true)
    useAppStore.getState().releaseDefaultSwitch(owner)
  })

  it('a rival admission is refused while the lock is held', async () => {
    const { useAppStore } = await import('@/store')
    const owner = useAppStore.getState().claimDefaultSwitch(['repo::/a'], { admitted: true })

    expect(useAppStore.getState().claimDefaultSwitch(['repo::/b'], { admitted: true })).toBeNull()
    useAppStore.getState().releaseDefaultSwitch(owner)
  })

  it('release and downgrade are owner-checked, so a loser cannot erase the winner', async () => {
    // Regression: the rejected flow's cleanup — and a fallback timer from an
    // already-superseded switch — cleared whatever marker was current,
    // blanking the winner's card mid-git and un-gating a third attempt.
    const { useAppStore } = await import('@/store')
    const owner = useAppStore.getState().claimDefaultSwitch(['repo::/a'], { admitted: true })

    useAppStore.getState().releaseDefaultSwitch('not-the-owner')
    useAppStore.getState().downgradeDefaultSwitchBlocking('not-the-owner')

    const marker = useAppStore.getState().defaultSwitchInFlight
    expect(marker?.admitted).toBe(true)
    expect(marker?.blocking).toBe(true)
    useAppStore.getState().releaseDefaultSwitch(owner)
    expect(useAppStore.getState().defaultSwitchInFlight).toBeNull()
  })

  it("upgrading one's own display marker keeps the original clock", async () => {
    const { useAppStore } = await import('@/store')
    const display = useAppStore.getState().claimDefaultSwitch(['repo::/a'], { admitted: false })
    const startedAt = useAppStore.getState().defaultSwitchInFlight?.startedAt

    const owner = useAppStore
      .getState()
      .claimDefaultSwitch(['repo::/a'], { admitted: true, token: display ?? undefined })

    const marker = useAppStore.getState().defaultSwitchInFlight
    expect(owner).toBe(display)
    expect(marker?.startedAt).toBe(startedAt)
    useAppStore.getState().releaseDefaultSwitch(owner)
  })

  it('a progress update refreshes the heartbeat only for the owner', async () => {
    // Staleness judges the heartbeat: a healthy multi-minute git swap keeps
    // pulsing, while a superseded flow's late stage cannot keep a marker alive.
    const { useAppStore } = await import('@/store')
    const owner = useAppStore.getState().claimDefaultSwitch(['repo::/a'], { admitted: true })
    const before = useAppStore.getState().defaultSwitchInFlight?.heartbeatAt ?? 0

    useAppStore.getState().setDefaultSwitchProgress({ phase: 'settling' }, 'not-the-owner')
    expect(useAppStore.getState().defaultSwitchInFlight?.progress?.phase).not.toBe('settling')

    await new Promise((resolve) => setTimeout(resolve, 2))
    useAppStore.getState().setDefaultSwitchProgress({ phase: 'settling' }, owner)
    const marker = useAppStore.getState().defaultSwitchInFlight
    expect(marker?.progress?.phase).toBe('settling')
    expect(marker?.heartbeatAt ?? 0).toBeGreaterThanOrEqual(before)
    useAppStore.getState().releaseDefaultSwitch(owner)
  })
})
