import React from 'react'
import { LoaderCircle } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  describeDefaultSwitchPhase,
  shouldShowDefaultSwitchStage
} from '@/lib/default-worktree-switch-progress'
import { DEFAULT_SWITCH_IN_FLIGHT_STALE_MS } from '@/lib/default-worktree-switch-readiness'

/**
 * The row a worktree card shows while a default switch is moving its agents.
 *
 * Why it names a stage: a switch runs for a minute or more once the post-wake
 * respawn sweeps are counted, and a single "Moving agents…" for all of it made
 * a slow switch look identical to a stuck one — there was no way to tell that
 * the flow was, say, still waiting 45 seconds for one agent to report a session.
 */
export function WorktreeCardSwitchStageRow({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element | null {
  const switchInFlight = useAppStore((s) =>
    shouldShowDefaultSwitchStage(
      s.defaultSwitchInFlight,
      worktreeId,
      DEFAULT_SWITCH_IN_FLIGHT_STALE_MS
    )
  )
  // Why two primitive selectors rather than one object: returning the progress
  // object would mint a new reference on every store change and re-render every
  // card. Phase and detail are strings, so they compare by value.
  const phase = useAppStore((s) => s.defaultSwitchInFlight?.progress?.phase)
  const detail = useAppStore((s) => s.defaultSwitchInFlight?.progress?.detail)

  if (!switchInFlight) {
    return null
  }
  const stage = phase
    ? describeDefaultSwitchPhase({ phase, ...(detail ? { detail } : {}) })
    : translate('auto.components.sidebar.WorktreeCardAgents.movingAgents', 'Moving agents…')

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
      <LoaderCircle className="size-3 shrink-0 animate-spin" />
      <span className="min-w-0 truncate" title={stage}>
        {stage}
      </span>
    </div>
  )
}
