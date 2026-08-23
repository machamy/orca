/**
 * Colour picking for the per-worktree Unity tint (fork feature).
 *
 * Shared between main (which writes the generated editor script) and the
 * renderer (which shows the colour menu and must predict every sibling's
 * effective colour to block duplicate assignments) — one implementation, or
 * the menu's "taken" markers and the script's actual colours drift apart.
 */

export type UnityWorktreeTint = {
  /** Palette name (or 'Custom'), shown in the generated file's header comment. */
  name: string
  hex: string
  rgb: { r: number; g: number; b: number }
  /** The strip behind the play controls: the accent's HUE at a fixed dark
   *  saturation/lightness. Mixing the pastel into grey instead would lighten the
   *  strip until it broke the dark theme and hid Unity's light icons — taking
   *  only the hue keeps every worktree equally dark and equally readable. */
  toolbarRgb: { r: number; g: number; b: number }
}

/**
 * Catppuccin Mocha accents — a well-known palette designed as a set, so the
 * colours stay distinguishable from each other and readable on Unity's dark
 * chrome. Pale members (rosewater/flamingo) are left out: they read as "white
 * bar" at a glance, which defeats the purpose.
 */
export const UNITY_TINT_PALETTE: readonly { name: string; hex: string }[] = [
  { name: 'Mauve', hex: '#cba6f7' },
  { name: 'Pink', hex: '#f5c2e7' },
  { name: 'Red', hex: '#f38ba8' },
  { name: 'Peach', hex: '#fab387' },
  { name: 'Yellow', hex: '#f9e2af' },
  { name: 'Green', hex: '#a6e3a1' },
  { name: 'Teal', hex: '#94e2d5' },
  { name: 'Sky', hex: '#89dceb' },
  { name: 'Blue', hex: '#89b4fa' },
  { name: 'Lavender', hex: '#b4befe' }
]

/**
 * Second tier, handed out only once every primary colour is claimed. Its hues
 * sit at the MIDPOINTS between the primary hues: the toolbar strip keeps hue
 * only (see `toolbarRgb`), so a tier-2 colour has to be far from both of its
 * primary neighbours on the hue wheel or two worktrees would paint the same bar.
 *
 * Kept a separate array rather than appended to `UNITY_TINT_PALETTE` because
 * assignment hashes modulo the PRIMARY length — growing that array would
 * re-roll the colour of every worktree that already exists.
 */
export const UNITY_TINT_FALLBACK_PALETTE: readonly { name: string; hex: string }[] = [
  { name: 'Amber', hex: '#eac9a4' },
  { name: 'Lime', hex: '#d4eaa4' },
  { name: 'Mint', hex: '#a4eabe' },
  { name: 'Aqua', hex: '#a4eae9' },
  { name: 'Cyan', hex: '#a4cfea' },
  { name: 'Denim', hex: '#a4b6ea' },
  { name: 'Iris', hex: '#afa4ea' },
  { name: 'Orchid', hex: '#e0a4ea' },
  { name: 'Rose', hex: '#eaa4c7' },
  { name: 'Coral', hex: '#eaa8a4' }
]

/** Every assignable colour, primary tier first — slot indices index into this. */
export const UNITY_TINT_ALL_COLORS: readonly { name: string; hex: string }[] = [
  ...UNITY_TINT_PALETTE,
  ...UNITY_TINT_FALLBACK_PALETTE
]

/** A manual override must be exactly this shape; anything else is ignored so a
 *  corrupted stored value degrades to the automatic colour, never to a crash. */
export function isValidUnityTintHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16) / 255,
    g: Number.parseInt(hex.slice(3, 5), 16) / 255,
    b: Number.parseInt(hex.slice(5, 7), 16) / 255
  }
}

/** FNV-1a: stable across processes and platforms, so a worktree keeps its
 *  colour for its whole life instead of shuffling on every regeneration. */
function hashLabel(label: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < label.length; index++) {
    hash ^= label.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function paletteIndexOfHex(hex: string): number {
  const wanted = hex.toLowerCase()
  return UNITY_TINT_ALL_COLORS.findIndex((entry) => entry.hex === wanted)
}

/** Slots to try, in preference order: the whole primary tier from the hashed
 *  slot, then the whole fallback tier from the same offset. */
function probeOrder(start: number): number[] {
  const primary = UNITY_TINT_PALETTE.length
  const fallback = UNITY_TINT_FALLBACK_PALETTE.length
  const order: number[] = []
  for (let step = 0; step < primary; step++) {
    order.push((start + step) % primary)
  }
  for (let step = 0; step < fallback; step++) {
    order.push(primary + ((start + step) % fallback))
  }
  return order
}

/**
 * Linear probing from the hashed slot, over a stable (sorted, de-duplicated)
 * sibling order. Manually coloured siblings are handled apart: they do not
 * consume a hashed slot, but the colour they picked is reserved so no automatic
 * assignment lands on a deliberate choice.
 *
 * With more worktrees than colours some pair must share one. The order below
 * decides WHO: an automatic worktree exhausts the fallback tier, then doubles up
 * with another automatic one, before it steps on a colour someone chose by hand.
 */
function probePaletteSlot(start: number, reserved: Set<number>, taken: Set<number>): number {
  const order = probeOrder(start)
  for (const slot of order) {
    if (!reserved.has(slot) && !taken.has(slot)) {
      return slot
    }
  }
  // Both tiers exhausted — share with another automatic worktree.
  for (const slot of order) {
    if (!reserved.has(slot)) {
      return slot
    }
  }
  // Every colour is somebody's deliberate pick; nothing left to prefer.
  return start
}

/**
 * The whole automatic assignment: every sibling without a manual colour, mapped
 * to its palette slot.
 *
 * Walking the full list (rather than stopping at one label) costs nothing — the
 * per-label answer already depended on every earlier sibling — and it lets a
 * caller that needs many labels pay for the walk once.
 */
function buildPaletteSlots(
  siblingLabels: readonly string[],
  overridesByLabel?: Readonly<Record<string, string>>
): Map<string, number> {
  // Only LIVE siblings reserve a colour. Overrides linger for worktrees that
  // were deleted or renamed, and honouring those would let ten dead entries
  // exhaust the palette and force two real worktrees onto one colour.
  const live = new Set(siblingLabels)
  const reserved = new Set<number>()
  for (const [owner, override] of Object.entries(overridesByLabel ?? {})) {
    if (!live.has(owner) || !isValidUnityTintHex(override)) {
      continue
    }
    const index = paletteIndexOfHex(override)
    if (index >= 0) {
      reserved.add(index)
    }
  }
  const ordered = [...live].filter((sibling) => !hasValidOverride(sibling, overridesByLabel)).sort()
  const slots = new Map<string, number>()
  const taken = new Set<number>()
  for (const sibling of ordered) {
    const slot = probePaletteSlot(hashLabel(sibling) % UNITY_TINT_PALETTE.length, reserved, taken)
    slots.set(sibling, slot)
    taken.add(slot)
  }
  return slots
}

function assignPaletteIndex(
  label: string,
  siblingLabels: readonly string[],
  overridesByLabel?: Readonly<Record<string, string>>
): number {
  return (
    buildPaletteSlots(siblingLabels, overridesByLabel).get(label) ??
    hashLabel(label) % UNITY_TINT_PALETTE.length
  )
}

function hasValidOverride(
  label: string,
  overridesByLabel?: Readonly<Record<string, string>>
): boolean {
  return isValidUnityTintHex(overridesByLabel?.[label])
}

/** Deep enough to sit inside Unity's dark chrome, saturated enough to name the
 *  colour across the room. Raise the lightness and light icons start to fail. */
const TOOLBAR_SATURATION = 0.55
const TOOLBAR_LIGHTNESS = 0.26

function rgbToHue(rgb: { r: number; g: number; b: number }): number {
  const max = Math.max(rgb.r, rgb.g, rgb.b)
  const min = Math.min(rgb.r, rgb.g, rgb.b)
  const delta = max - min
  if (delta === 0) {
    return 0
  }
  const sector =
    max === rgb.r
      ? ((rgb.g - rgb.b) / delta) % 6
      : max === rgb.g
        ? (rgb.b - rgb.r) / delta + 2
        : (rgb.r - rgb.g) / delta + 4
  return (sector + 6) % 6
}

function hueToRgb(
  hue: number,
  saturation: number,
  lightness: number
): { r: number; g: number; b: number } {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const second = chroma * (1 - Math.abs((hue % 2) - 1))
  const [r, g, b] = (
    hue < 1
      ? [chroma, second, 0]
      : hue < 2
        ? [second, chroma, 0]
        : hue < 3
          ? [0, chroma, second]
          : hue < 4
            ? [0, second, chroma]
            : hue < 5
              ? [second, 0, chroma]
              : [chroma, 0, second]
  ) as [number, number, number]
  const offset = lightness - chroma / 2
  return { r: r + offset, g: g + offset, b: b + offset }
}

function tintFromHex(hex: string): UnityWorktreeTint {
  const normalized = hex.toLowerCase()
  const rgb = hexToRgb(normalized)
  const max = Math.max(rgb.r, rgb.g, rgb.b)
  const min = Math.min(rgb.r, rgb.g, rgb.b)
  return {
    name: UNITY_TINT_ALL_COLORS[paletteIndexOfHex(normalized)]?.name ?? 'Custom',
    hex: normalized,
    rgb,
    // An achromatic pick has no hue — force-saturating it would turn grey into
    // red, so it becomes a neutral dark strip instead.
    toolbarRgb:
      max - min < 0.05
        ? hueToRgb(0, 0, TOOLBAR_LIGHTNESS)
        : hueToRgb(rgbToHue(rgb), TOOLBAR_SATURATION, TOOLBAR_LIGHTNESS)
  }
}

/** The dark strip actually painted for an accent — exported so the menu can
 *  preview exactly what the toolbar will look like. */
export function unityToolbarPreviewHex(accentHex: string): string {
  const toolbar = tintFromHex(accentHex).toolbarRgb
  const channel = (value: number): string =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(toolbar.r)}${channel(toolbar.g)}${channel(toolbar.b)}`
}

/**
 * Colour for one worktree.
 *
 * A manual override (assigned from the worktree context menu) wins outright.
 * Otherwise the hash alone is not enough: ten palette entries against a repo
 * with ten worktrees collides almost surely (birthday problem — measured on
 * this repo's real worktrees, three pairs shared a colour), and two
 * same-coloured editors defeat the entire point. So when the caller knows the
 * sibling worktrees, the hash becomes a starting slot and the assignment
 * probes forward to a free one.
 *
 * Order matters for stability: siblings are walked sorted by name, so a
 * worktree keeps its colour as long as the names before it are unchanged, and
 * a NEW worktree takes a free slot instead of shifting everyone.
 */
export function pickUnityWorktreeTint(
  label: string,
  siblingLabels?: readonly string[],
  overridesByLabel?: Readonly<Record<string, string>>
): UnityWorktreeTint {
  const override = overridesByLabel?.[label]
  if (isValidUnityTintHex(override)) {
    return tintFromHex(override)
  }
  return tintFromPaletteSlot(
    siblingLabels && siblingLabels.length > 1
      ? assignPaletteIndex(label, siblingLabels, overridesByLabel)
      : hashLabel(label) % UNITY_TINT_PALETTE.length
  )
}

function tintFromPaletteSlot(index: number): UnityWorktreeTint {
  const entry = UNITY_TINT_ALL_COLORS[index] as { name: string; hex: string }
  const rgb = hexToRgb(entry.hex)
  return {
    name: entry.name,
    hex: entry.hex,
    rgb,
    toolbarRgb: hueToRgb(rgbToHue(rgb), TOOLBAR_SATURATION, TOOLBAR_LIGHTNESS)
  }
}

function assignUnityWorktreeTints(
  siblingLabels: readonly string[],
  overridesByLabel?: Readonly<Record<string, string>>
): ReadonlyMap<string, UnityWorktreeTint> {
  const byLabel = new Map<string, UnityWorktreeTint>()
  for (const label of new Set(siblingLabels)) {
    const override = overridesByLabel?.[label]
    if (isValidUnityTintHex(override)) {
      byLabel.set(label, tintFromHex(override))
    }
  }
  // One sibling cannot collide with anyone, and `pickUnityWorktreeTint` skips
  // the probe in that case — this must agree with it, not merely approximate it.
  if (siblingLabels.length > 1) {
    for (const [label, slot] of buildPaletteSlots(siblingLabels, overridesByLabel)) {
      byLabel.set(label, tintFromPaletteSlot(slot))
    }
    return byLabel
  }
  for (const label of new Set(siblingLabels)) {
    if (!byLabel.has(label)) {
      byLabel.set(label, tintFromPaletteSlot(hashLabel(label) % UNITY_TINT_PALETTE.length))
    }
  }
  return byLabel
}

const ASSIGNMENT_CACHE = new Map<string, ReadonlyMap<string, UnityWorktreeTint>>()
/** A handful of repos' worth; the sidebar only ever reads the newest few. */
const ASSIGNMENT_CACHE_LIMIT = 8

/**
 * Every sibling's colour, computed once per distinct (sibling set, overrides).
 *
 * `pickUnityWorktreeTint` derives the WHOLE assignment table to read one cell,
 * which is right for a one-shot caller and quadratic for the sidebar, where N
 * rows ask on every worktree store tick. Rows must call this instead: the key is
 * the sibling names themselves, so a tick that leaves the set alone — an agent
 * writing output, say — is a cache hit and no table is rebuilt.
 */
export function getUnityWorktreeTintAssignment(
  siblingLabels: readonly string[],
  overridesByLabel?: Readonly<Record<string, string>>
): ReadonlyMap<string, UnityWorktreeTint> {
  // NUL-separated, with the overrides fenced off behind one more control
  // char: a folder name may hold anything a path segment may, so a printable
  // separator could let two different sibling sets share a key.
  const key = `${siblingLabels.join('\u0000')}\u0001${
    overridesByLabel ? JSON.stringify(overridesByLabel) : ''
  }`
  const cached = ASSIGNMENT_CACHE.get(key)
  if (cached) {
    return cached
  }
  const assignment = assignUnityWorktreeTints(siblingLabels, overridesByLabel)
  ASSIGNMENT_CACHE.set(key, assignment)
  // Insertion-ordered, so the first key is the oldest.
  if (ASSIGNMENT_CACHE.size > ASSIGNMENT_CACHE_LIMIT) {
    ASSIGNMENT_CACHE.delete(ASSIGNMENT_CACHE.keys().next().value as string)
  }
  return assignment
}
