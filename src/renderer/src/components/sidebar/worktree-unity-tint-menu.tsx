import React, { useCallback, useMemo, useState } from 'react'
import { Check, Palette } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  UNITY_TINT_PALETTE,
  isValidUnityTintHex,
  pickUnityWorktreeTint,
  unityToolbarPreviewHex
} from '../../../../shared/unity-worktree-tint-palette'
import { getRuntimePathBasename } from '../../../../shared/cross-platform-path'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'

/**
 * Fork: the per-worktree Unity toolbar colour submenu (presets + custom
 * picker) rendered inside the Unity section of the worktree context menu.
 * Split from worktree-unity-menu.tsx purely for size; the parent owns the
 * sibling-label list (it already computes it for open/seed) and the dialog
 * lifecycle contract is the same: `tintPickerOpen` must keep the menu wrapper
 * mounted.
 */
export function useUnityWorktreeTintMenu(args: {
  worktree: Worktree
  repo: Repo | null
  isDefaultWorktreePath: boolean
  isDeleting: boolean
  unityTintSiblingLabels: readonly string[]
  /** The same siblings, with paths — a colour change can move another
   *  worktree's automatic colour, and its script has to be rewritten too. */
  unityTintSiblingWorktrees: readonly Worktree[]
}): {
  tintMenuItems: React.ReactNode
  tintPickerDialog: React.ReactNode
  tintPickerOpen: boolean
} {
  const {
    worktree,
    repo,
    isDefaultWorktreePath,
    isDeleting,
    unityTintSiblingLabels,
    unityTintSiblingWorktrees
  } = args
  const [tintPickerOpen, setTintPickerOpen] = useState(false)
  const [tintPickerHex, setTintPickerHex] = useState('#cba6f7')
  const worktreeLabel = useMemo(() => getRuntimePathBasename(worktree.path), [worktree.path])
  const tintOverrides = repo?.unityTintOverrides
  const tintFeatureOn = repo != null && repo.unityWorktreeTint !== false
  // Only a sibling's DELIBERATE pick is off limits. Blocking automatic colours
  // too would lock the menu on any repo with as many worktrees as the palette
  // has colours — every entry reads "in use" and nothing is selectable. An
  // automatic sibling simply moves aside: taking its colour reserves it, and
  // the caller rewrites whichever sibling shifted.
  const siblingTintHexes = useMemo(() => {
    const claimed = new Set<string>()
    for (const label of unityTintSiblingLabels) {
      if (label === worktreeLabel) {
        continue
      }
      const override = tintOverrides?.[label]
      if (isValidUnityTintHex(override)) {
        claimed.add(override.toLowerCase())
      }
    }
    return claimed
  }, [unityTintSiblingLabels, worktreeLabel, tintOverrides])
  const storedOverride = tintOverrides?.[worktreeLabel]
  const ownOverrideHex = isValidUnityTintHex(storedOverride) ? storedOverride.toLowerCase() : null
  const effectiveTint = useMemo(
    () => pickUnityWorktreeTint(worktreeLabel, unityTintSiblingLabels, tintOverrides),
    [worktreeLabel, unityTintSiblingLabels, tintOverrides]
  )
  const applyTintChoice = useCallback(
    async (hex: string | null) => {
      if (!repo) {
        return
      }
      const next = { ...repo.unityTintOverrides }
      if (hex) {
        // defineProperty, not assignment: a worktree folder literally named
        // `__proto__` is legal, and plain assignment there hits Object.prototype's
        // setter and stores nothing.
        Object.defineProperty(next, worktreeLabel, {
          value: hex.toLowerCase(),
          enumerable: true,
          writable: true,
          configurable: true
        })
      } else {
        delete next[worktreeLabel]
      }
      const previous = repo.unityTintOverrides
      void useAppStore
        .getState()
        .updateRepo(repo.id, { unityTintOverrides: next })
        .catch(() => undefined)
      const labels = [...unityTintSiblingLabels]
      // Re-write the script now so the choice lands without opening Unity; a
      // running editor picks it up on its next focus.
      const writes = [
        window.api.unity
          .applyWorktreeTint({
            worktreePath: worktree.path,
            enabled: tintFeatureOn && !isDefaultWorktreePath,
            tintSiblingLabels: labels,
            tintOverridesByLabel: next
          })
          .catch(() => null)
      ]
      // Taking or releasing a colour shifts which slots are free, so a sibling
      // on automatic can move too. Its script still holds the old colour until
      // something rewrites it — two open editors would share one colour.
      for (const sibling of unityTintSiblingWorktrees) {
        const label = getRuntimePathBasename(sibling.path)
        if (label === worktreeLabel) {
          continue
        }
        // applyWorktreeTint writes on the LOCAL filesystem, so a remote row's
        // path must never reach it — it names a file on another machine.
        if ((sibling.hostId ?? 'local') !== 'local') {
          continue
        }
        if (
          pickUnityWorktreeTint(label, labels, previous).hex ===
          pickUnityWorktreeTint(label, labels, next).hex
        ) {
          continue
        }
        writes.push(
          window.api.unity
            .applyWorktreeTint({
              worktreePath: sibling.path,
              enabled: tintFeatureOn,
              tintSiblingLabels: labels,
              tintOverridesByLabel: next
            })
            .catch(() => null)
        )
      }
      await Promise.all(writes)
    },
    [
      repo,
      worktree.path,
      worktreeLabel,
      tintFeatureOn,
      isDefaultWorktreePath,
      unityTintSiblingLabels,
      unityTintSiblingWorktrees
    ]
  )
  const tintPickerTaken = siblingTintHexes.has(tintPickerHex.toLowerCase())
  const tintPickerDialog = (
    <Dialog open={tintPickerOpen} onOpenChange={setTintPickerOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.unityTintCustomTitle',
              'Custom Unity Toolbar Color'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.unityTintCustomBody',
              'The toolbar keeps a fixed dark shade and takes only the hue of your pick, so light icons stay readable.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label={translate(
              'auto.components.sidebar.WorktreeContextMenu.unityTintCustomTitle',
              'Custom Unity Toolbar Color'
            )}
            className="h-9 w-14 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
            value={tintPickerHex}
            onChange={(event) => setTintPickerHex(event.target.value)}
          />
          <div
            aria-hidden
            className="h-9 flex-1 rounded-md border border-border"
            style={{ backgroundColor: unityToolbarPreviewHex(tintPickerHex) }}
          />
        </div>
        {tintPickerTaken ? (
          <p className="text-xs text-destructive">
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.unityTintDuplicate',
              'Another worktree of this project already uses this color.'
            )}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setTintPickerOpen(false)}>
            {translate('auto.components.sidebar.WorktreeContextMenu.unityConfirmCancel', 'Cancel')}
          </Button>
          <Button
            disabled={tintPickerTaken || !isValidUnityTintHex(tintPickerHex)}
            onClick={() => {
              setTintPickerOpen(false)
              void applyTintChoice(tintPickerHex)
            }}
          >
            {translate('auto.components.sidebar.WorktreeContextMenu.unityTintApply', 'Apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  const tintMenuItems =
    tintFeatureOn && !isDefaultWorktreePath ? (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={isDeleting}>
          <Palette className="size-3.5" />
          {translate(
            'auto.components.sidebar.WorktreeContextMenu.unityTintMenu',
            'Unity Toolbar Color'
          )}
          <span
            aria-hidden
            className="ml-auto size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: effectiveTint.hex }}
          />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-44">
          <DropdownMenuItem
            onSelect={() => {
              void applyTintChoice(null)
            }}
          >
            {ownOverrideHex === null ? (
              <Check className="size-3.5" />
            ) : (
              <span aria-hidden className="size-3.5" />
            )}
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.unityTintAutomatic',
              'Automatic'
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {UNITY_TINT_PALETTE.map((entry) => {
            const takenBySibling = siblingTintHexes.has(entry.hex)
            const isCurrent = ownOverrideHex === entry.hex
            return (
              <DropdownMenuItem
                key={entry.hex}
                disabled={takenBySibling}
                onSelect={() => {
                  void applyTintChoice(entry.hex)
                }}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.hex }}
                />
                {entry.name}
                {/* Marked (and blocked) even when it IS the current pick: past the
                    palette size the automatic assignment runs out of free slots and
                    can land on a colour an override already holds. */}
                {takenBySibling
                  ? ` ${translate(
                      'auto.components.sidebar.WorktreeContextMenu.unityTintTaken',
                      '(in use)'
                    )}`
                  : null}
                {isCurrent ? <Check className="ml-auto size-3.5" /> : null}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setTintPickerHex(effectiveTint.hex)
              setTintPickerOpen(true)
            }}
          >
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.unityTintCustom',
              'Custom Color…'
            )}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    ) : null

  return { tintMenuItems, tintPickerDialog, tintPickerOpen }
}
