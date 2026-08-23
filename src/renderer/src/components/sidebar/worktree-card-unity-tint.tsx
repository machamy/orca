import React from 'react'

import { cn } from '@/lib/utils'
import type { UnitySidebarTintMode } from '../../../../shared/repo-types'

/**
 * Card-relative geometry per treatment. All three are out of flow, so a row
 * looks and measures identically whether or not it carries a colour — the bar
 * cannot shift the text, and the chip cannot move where the name truncates.
 */
const TINT_TREATMENT_CLASS: Record<Exclude<UnitySidebarTintMode, 'off'>, string> = {
  // 3px stripe in the card's left gutter, inset 6px top and bottom.
  bar: 'top-1.5 bottom-1.5 left-1 w-[3px] rounded-[2px]',
  // Whole-card wash. `-z-10` drops it below every glyph in the row (a card that
  // paints it must set `isolation: isolate`, or it slides behind the sidebar).
  // The alpha is NOT under hover/active — in ΔE2000 every wash already clears
  // light hover (min 3.6 vs 2.0) and 18 of 20 clear light active (4.0). A tinted
  // row reads as tinted rather than selected because it is chromatic while both
  // row states are neutral darkenings, not because it is fainter than them.
  wash: 'inset-0 -z-10 rounded-[inherit] opacity-[0.16] dark:opacity-[0.1]',
  // 10x5 pill at the trailing end of the 20px title row (5px card inset + 7.5px),
  // sat in the card's right padding so hover quick actions keep their lane.
  chip: 'top-[12.5px] right-0.5 h-[5px] w-[10px] rounded-[3px]'
}

/**
 * Fork: the sidebar echo of a worktree's Unity toolbar colour.
 *
 * Presentation only — the caller resolves both the hex and the mode (see
 * use-worktree-sidebar-unity-tint.ts), so treatments can be reshaped here
 * without touching the gates, the palette, or their tests.
 */
export function WorktreeCardUnityTint({
  hex,
  mode,
  className
}: {
  hex: string | null
  mode: UnitySidebarTintMode
  className?: string
}): React.JSX.Element | null {
  if (!hex || mode === 'off') {
    return null
  }
  return (
    <span
      data-worktree-unity-tint={hex}
      data-worktree-unity-tint-mode={mode}
      // Decorative: the colour only restates which worktree the row already
      // names, and default-on would otherwise add one announced node per row.
      aria-hidden
      className={cn('pointer-events-none absolute', TINT_TREATMENT_CLASS[mode], className)}
      style={{ backgroundColor: hex }}
    />
  )
}
