import { translate } from '@/i18n/i18n'

/**
 * The stages a default-worktree switch moves through, in order.
 *
 * Why publish them: the sidebar showed one static "Moving agents…" for the whole
 * run, which is upwards of a minute once the post-wake respawn sweeps are
 * counted. With no stage and no subject, a slow switch is indistinguishable from
 * a stuck one, and a switch that proceeded WITHOUT some agent's session said so
 * only in a toast the user may already have dismissed.
 */
export type DefaultSwitchPhase =
  | 'waiting-for-agents'
  | 'sleeping'
  | 'swapping-branches'
  | 'restoring'
  | 'settling'
  | 'verifying'

export type DefaultSwitchProgress = {
  phase: DefaultSwitchPhase
  /** What the phase is acting on or waiting for — usually a tab name. */
  detail?: string
}

/** Whether a worktree card should show the stage row right now. Pure so it can
 *  be tested — zustand returns the INITIAL state under server rendering, so a
 *  store-connected component cannot be exercised with `renderToStaticMarkup`. */
export function shouldShowDefaultSwitchStage(
  inFlight:
    | { worktreeIds: readonly string[]; startedAt: number; heartbeatAt?: number }
    | null
    | undefined,
  worktreeId: string,
  staleAfterMs: number,
  now: number = Date.now()
): boolean {
  if (!inFlight || !inFlight.worktreeIds.includes(worktreeId)) {
    return false
  }
  // A wedged switch must not pin the row forever. Judged on the heartbeat, so
  // a long healthy flow that keeps pulsing stays visible.
  return now - (inFlight.heartbeatAt ?? inFlight.startedAt) < staleAfterMs
}

export function describeDefaultSwitchPhase(progress: DefaultSwitchProgress): string {
  switch (progress.phase) {
    case 'waiting-for-agents':
      return progress.detail
        ? translate(
            'auto.lib.defaultWorktreeSwitchProgress.waitingForAgent',
            'Waiting for {{detail}} to report its session…',
            { detail: progress.detail }
          )
        : translate(
            'auto.lib.defaultWorktreeSwitchProgress.waitingForAgents',
            'Waiting for agents to report their sessions…'
          )
    case 'sleeping':
      return translate(
        'auto.lib.defaultWorktreeSwitchProgress.sleeping',
        'Pausing terminals and capturing sessions…'
      )
    case 'swapping-branches':
      return progress.detail
        ? translate(
            'auto.lib.defaultWorktreeSwitchProgress.swappingNamed',
            'Exchanging branches with {{detail}}…',
            { detail: progress.detail }
          )
        : translate('auto.lib.defaultWorktreeSwitchProgress.swapping', 'Exchanging branches…')
    case 'restoring':
      return translate(
        'auto.lib.defaultWorktreeSwitchProgress.restoring',
        'Reopening terminals and resuming agents…'
      )
    case 'settling':
      return translate(
        'auto.lib.defaultWorktreeSwitchProgress.settling',
        'Bringing back any pane that lagged…'
      )
    case 'verifying':
      // Why this stage still shows after the switch is usable: the checks run
      // for 75s, and going straight to nothing looked like the switch had ended
      // while panes could still be repaired behind it.
      return translate(
        'auto.lib.defaultWorktreeSwitchProgress.verifying',
        'Switch done — still checking every pane…'
      )
  }
}
