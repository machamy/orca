/**
 * Fork: pane-corner pill naming the agent's current model and reasoning effort.
 * Left- or right-click opens its own menu, which is also the only in-place way
 * to move or hide it — the Settings pane owns turning it back on, because a
 * hidden badge has nothing left to click.
 */

import { useCallback, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import {
  AGENT_MODEL_BADGE_CORNERS,
  type AgentModelBadgeCorner
} from '../../../../shared/agent-model-badge-settings'
import type { AgentModelBadgeReading } from './agent-model-badge-reading'

const CORNER_CLASS: Record<AgentModelBadgeCorner, string> = {
  'top-left': 'top-1 left-1',
  'top-right': 'top-1 right-1',
  // Clear of the terminal's scrollbar gutter, which the right corners share.
  'bottom-right': 'bottom-1 right-2'
}

function cornerLabel(corner: AgentModelBadgeCorner): string {
  switch (corner) {
    case 'top-left':
      return translate('auto.components.terminalPane.AgentModelBadge.corner.topLeft', 'Top left')
    case 'top-right':
      return translate('auto.components.terminalPane.AgentModelBadge.corner.topRight', 'Top right')
    case 'bottom-right':
      return translate(
        'auto.components.terminalPane.AgentModelBadge.corner.bottomRight',
        'Bottom right'
      )
  }
}

export function AgentModelBadge({
  reading,
  corner,
  onMoveToCorner,
  onHide
}: {
  reading: AgentModelBadgeReading
  corner: AgentModelBadgeCorner
  onMoveToCorner: (corner: AgentModelBadgeCorner) => void
  onHide: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const openFromContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setOpen(true)
  }, [])

  const text = reading.effortLabel
    ? `${reading.modelLabel} · ${reading.effortLabel}`
    : reading.modelLabel

  return (
    <div className={`pointer-events-none absolute z-20 ${CORNER_CLASS[corner]}`}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onContextMenu={openFromContextMenu}
                className={`pointer-events-auto rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] leading-none backdrop-blur-sm transition-opacity hover:opacity-100 ${
                  reading.observed
                    ? 'text-muted-foreground opacity-70'
                    : 'text-muted-foreground/70 opacity-50 italic'
                }`}
              >
                {text}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="left">
            {reading.observed
              ? translate(
                  'auto.components.terminalPane.AgentModelBadge.tooltip.observed',
                  'Model and effort reported by the running agent.'
                )
              : translate(
                  'auto.components.terminalPane.AgentModelBadge.tooltip.unconfirmed',
                  'What Orca launched this agent with. The agent has not reported back, so it may have changed since.'
                )}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="pointer-events-auto">
          <DropdownMenuLabel>
            {translate('auto.components.terminalPane.AgentModelBadge.menu.position', 'Position')}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={corner}
            onValueChange={(next) => onMoveToCorner(next as AgentModelBadgeCorner)}
          >
            {AGENT_MODEL_BADGE_CORNERS.map((candidate) => (
              <DropdownMenuRadioItem key={candidate} value={candidate}>
                {cornerLabel(candidate)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onHide}>
            {translate(
              'auto.components.terminalPane.AgentModelBadge.menu.hide',
              'Hide (Settings → Experimental to restore)'
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
