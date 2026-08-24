import { describe, expect, it } from 'vitest'
import {
  UNITY_TINT_ALL_COLORS,
  UNITY_TINT_FALLBACK_PALETTE,
  UNITY_TINT_OPT_OUT,
  UNITY_TINT_PALETTE,
  getUnityWorktreeTintAssignment,
  isUnityTintOptOut,
  isValidUnityTintHex,
  pickUnityWorktreeTint,
  unityToolbarPreviewHex
} from './unity-worktree-tint-palette'

const SIBLINGS = ['feature-a', 'feature-b', 'feature-c']

describe('pickUnityWorktreeTint (automatic)', () => {
  it('is deterministic for the same label and siblings', () => {
    expect(pickUnityWorktreeTint('feature-a', SIBLINGS)).toEqual(
      pickUnityWorktreeTint('feature-a', SIBLINGS)
    )
  })

  it('never hands two siblings the same colour while slots remain', () => {
    const seen = new Set(SIBLINGS.map((label) => pickUnityWorktreeTint(label, SIBLINGS).hex))
    expect(seen.size).toBe(SIBLINGS.length)
  })

  it('pins the exact assignment for a known sibling set', () => {
    // Golden values: a change to the hash or the probing order shifts real
    // worktrees to new colours, which is a user-visible regression, not a
    // refactor. Update these deliberately or not at all.
    const set = ['dev-2', 'worktree-1', 'worktree-2', 'worktree-3', 'worktree-4']
    expect(Object.fromEntries(set.map((l) => [l, pickUnityWorktreeTint(l, set).hex]))).toEqual({
      'dev-2': '#fab387',
      'worktree-1': '#94e2d5',
      'worktree-2': '#f9e2af',
      'worktree-3': '#a6e3a1',
      'worktree-4': '#89dceb'
    })
  })

  it('keeps the toolbar strip dark for every palette entry', () => {
    for (const entry of UNITY_TINT_ALL_COLORS) {
      const tint = pickUnityWorktreeTint('x', undefined, { x: entry.hex })
      const luma = 0.299 * tint.toolbarRgb.r + 0.587 * tint.toolbarRgb.g + 0.114 * tint.toolbarRgb.b
      expect(luma).toBeLessThan(0.45)
    }
  })
})

describe('pickUnityWorktreeTint (fallback tier)', () => {
  const labels = (count: number): string[] => Array.from({ length: count }, (_, i) => `w${i}`)
  const hexesOf = (set: string[]): string[] => set.map((l) => pickUnityWorktreeTint(l, set).hex)
  const FALLBACK_HEXES = new Set(UNITY_TINT_FALLBACK_PALETTE.map((entry) => entry.hex))

  it('gives eleven-plus siblings distinct colours by spilling into tier 2', () => {
    for (const count of [11, 15, UNITY_TINT_ALL_COLORS.length]) {
      const picked = hexesOf(labels(count))
      expect(new Set(picked).size).toBe(count)
    }
  })

  it('leaves tier 2 untouched until tier 1 is fully claimed', () => {
    for (let count = 1; count <= UNITY_TINT_PALETTE.length; count++) {
      const used = hexesOf(labels(count)).filter((hex) => FALLBACK_HEXES.has(hex))
      expect(used).toEqual([])
    }
    // One sibling past the primary tier: exactly one worktree crosses over.
    const eleven = hexesOf(labels(11)).filter((hex) => FALLBACK_HEXES.has(hex))
    expect(eleven.length).toBe(1)
  })

  it("names a fallback colour instead of calling it 'Custom'", () => {
    expect(pickUnityWorktreeTint('x', undefined, { x: '#a4eabe' }).name).toBe('Mint')
    for (const entry of UNITY_TINT_FALLBACK_PALETTE) {
      expect(pickUnityWorktreeTint('x', undefined, { x: entry.hex.toUpperCase() }).name).toBe(
        entry.name
      )
    }
  })

  it('keeps every toolbar strip visibly distinct, tier 1 and tier 2 alike', () => {
    // The strip carries HUE only, so two colours sharing a hue paint the same
    // bar however different their accents look in the menu.
    const strips = UNITY_TINT_ALL_COLORS.map((entry) => unityToolbarPreviewHex(entry.hex))
    expect(new Set(strips).size).toBe(UNITY_TINT_ALL_COLORS.length)
  })
})

describe('pickUnityWorktreeTint (overrides)', () => {
  it('an own override wins outright, with the palette name when it matches one', () => {
    const tint = pickUnityWorktreeTint('feature-a', SIBLINGS, { 'feature-a': '#A6E3A1' })
    expect(tint.hex).toBe('#a6e3a1')
    expect(tint.name).toBe('Green')
  })

  it('a non-palette override is named Custom', () => {
    expect(pickUnityWorktreeTint('feature-a', SIBLINGS, { 'feature-a': '#123456' }).name).toBe(
      'Custom'
    )
  })

  it('an invalid stored override degrades to the automatic colour', () => {
    expect(pickUnityWorktreeTint('feature-a', SIBLINGS, { 'feature-a': 'garbage' })).toEqual(
      pickUnityWorktreeTint('feature-a', SIBLINGS)
    )
  })

  it("automatic assignment avoids a palette colour taken by a live sibling's override", () => {
    // The reserving sibling has to be one of SIBLINGS — an override is only a
    // claim while the worktree it names still exists.
    for (const label of SIBLINGS) {
      const other = SIBLINGS.find((candidate) => candidate !== label) as string
      const auto = pickUnityWorktreeTint(label, SIBLINGS)
      const withTaken = pickUnityWorktreeTint(label, SIBLINGS, { [other]: auto.hex })
      expect(withTaken.hex).not.toBe(auto.hex)
    }
  })

  it('makes automatic worktrees double up before stepping on a manual pick', () => {
    // One worktree past BOTH tiers: one pair MUST share. The pair has to be two
    // automatic worktrees — a colour someone chose by hand is not up for grabs.
    const set = Array.from({ length: UNITY_TINT_ALL_COLORS.length + 1 }, (_, i) => `w${i}`)
    const manual = { w0: '#a6e3a1' }
    const picked = Object.fromEntries(
      set.map((label) => [label, pickUnityWorktreeTint(label, set, manual).hex])
    )
    expect(picked.w0).toBe('#a6e3a1')
    expect(set.filter((label) => label !== 'w0' && picked[label] === '#a6e3a1')).toEqual([])
    // Exactly one colour is doubled up, and it is shared by two automatics.
    expect(new Set(Object.values(picked)).size).toBe(UNITY_TINT_ALL_COLORS.length)
  })

  it('ignores overrides left behind by deleted or renamed worktrees', () => {
    // Ten stale entries cover the whole palette; two live worktrees must still
    // get two different colours rather than colliding on an exhausted set.
    const stale = Object.fromEntries(
      UNITY_TINT_PALETTE.map((entry, index) => [`gone-${index}`, entry.hex])
    )
    const live = ['feature-a', 'feature-b']
    const picked = live.map((label) => pickUnityWorktreeTint(label, live, stale).hex)
    expect(new Set(picked).size).toBe(2)
    // And the stale entries change nothing at all for the live pair.
    expect(picked).toEqual(live.map((label) => pickUnityWorktreeTint(label, live).hex))
  })

  it('hands the freed slot to another sibling, not merely skips it', () => {
    // 'beta' automatically holds Pink. Overriding it to a custom colour must
    // RELEASE Pink — 'epsilon' probes onto it — rather than leave it reserved.
    const set = ['alpha', 'beta', 'epsilon']
    expect(pickUnityWorktreeTint('beta', set).hex).toBe('#f5c2e7')
    expect(pickUnityWorktreeTint('epsilon', set).hex).not.toBe('#f5c2e7')

    const after = { beta: '#123456' }
    expect(pickUnityWorktreeTint('epsilon', set, after).hex).toBe('#f5c2e7')
    // The custom colour itself is never handed out, and nobody doubles up.
    const all = set.map((label) => pickUnityWorktreeTint(label, set, after).hex)
    expect(all).toEqual(['#89dceb', '#123456', '#f5c2e7'])
    expect(new Set(all).size).toBe(3)
  })

  it('an overridden sibling stops consuming its hashed slot', () => {
    // With sibling 'feature-a' moved to a custom colour, its old palette slot
    // frees up for the others — no automatic pick may collide with any
    // override, and the remaining autos stay pairwise distinct.
    const overrides = { 'feature-a': '#123456' }
    const autoHexes = ['feature-b', 'feature-c'].map(
      (label) => pickUnityWorktreeTint(label, SIBLINGS, overrides).hex
    )
    expect(new Set(autoHexes).size).toBe(2)
    expect(autoHexes).not.toContain('#123456')
  })

  it('an achromatic custom pick becomes a neutral dark strip, not red', () => {
    const tint = pickUnityWorktreeTint('feature-a', SIBLINGS, { 'feature-a': '#808080' })
    expect(tint.toolbarRgb.r).toBeCloseTo(tint.toolbarRgb.g, 5)
    expect(tint.toolbarRgb.g).toBeCloseTo(tint.toolbarRgb.b, 5)
  })
})

describe('pickUnityWorktreeTint (opt-out)', () => {
  /** The whole semantic in one assertion: for everyone else, opting a label out
   *  is indistinguishable from that worktree not existing. */
  const expectSameAsDeleting = (
    labels: readonly string[],
    optedOut: string,
    overrides: Record<string, string> = {}
  ): void => {
    const remaining = labels.filter((label) => label !== optedOut)
    for (const label of remaining) {
      expect(
        pickUnityWorktreeTint(label, labels, { ...overrides, [optedOut]: UNITY_TINT_OPT_OUT })
      ).toEqual(pickUnityWorktreeTint(label, remaining, overrides))
    }
  }

  const many = (count: number): string[] => Array.from({ length: count }, (_, i) => `wt-${i}`)

  it.each([
    { name: 'a pair, dropping to the single-sibling shortcut', labels: ['solo-a', 'solo-b'] },
    { name: 'a handful', labels: SIBLINGS },
    { name: 'a probing set', labels: ['alpha', 'beta', 'epsilon'] },
    { name: 'exactly one tier', labels: many(UNITY_TINT_PALETTE.length) },
    { name: 'both tiers plus doubling up', labels: many(UNITY_TINT_ALL_COLORS.length + 3) }
  ])('leaves every sibling exactly where deleting the worktree would: $name', ({ labels }) => {
    for (const optedOut of labels) {
      expectSameAsDeleting(labels, optedOut)
    }
  })

  it('holds that equivalence with hand-picked colours in the mix', () => {
    const labels = [...SIBLINGS, 'manual', 'custom']
    const overrides = { manual: '#f38ba8', custom: '#123456' }
    for (const optedOut of labels) {
      expectSameAsDeleting(labels, optedOut, overrides)
    }
  })

  it('reserves nothing, so a sibling takes the colour it would have had', () => {
    // Mirrors the custom-colour case above: 'beta' automatically holds Pink, and
    // 'epsilon' only reaches Pink once beta stops competing for it.
    const set = ['alpha', 'beta', 'epsilon']
    expect(pickUnityWorktreeTint('beta', set).hex).toBe('#f5c2e7')
    expect(pickUnityWorktreeTint('epsilon', set).hex).not.toBe('#f5c2e7')

    const optedOut = { beta: UNITY_TINT_OPT_OUT }
    expect(pickUnityWorktreeTint('epsilon', set, optedOut).hex).toBe('#f5c2e7')
    // Contrast: pinning beta to that same Pink by hand DOES reserve it.
    expect(pickUnityWorktreeTint('epsilon', set, { beta: '#f5c2e7' }).hex).not.toBe('#f5c2e7')
  })

  it('frees capacity, so a set past both tiers stops doubling up', () => {
    // One worktree too many for the palette forces exactly one shared colour.
    // Removing one worktree's colour must buy back that last slot.
    const set = many(UNITY_TINT_ALL_COLORS.length + 1)
    const hexes = (overrides?: Record<string, string>): string[] =>
      set
        .filter((l) => !isUnityTintOptOut(overrides?.[l]))
        .map((l) => pickUnityWorktreeTint(l, set, overrides).hex)
    expect(new Set(hexes()).size).toBe(UNITY_TINT_ALL_COLORS.length)
    const freed = hexes({ 'wt-0': UNITY_TINT_OPT_OUT })
    expect(new Set(freed).size).toBe(freed.length)
  })

  it('ignores an opt-out left behind by a deleted or renamed worktree', () => {
    const stale = Object.fromEntries(
      UNITY_TINT_PALETTE.map((_, index) => [`gone-${index}`, UNITY_TINT_OPT_OUT])
    )
    expect(SIBLINGS.map((label) => pickUnityWorktreeTint(label, SIBLINGS, stale))).toEqual(
      SIBLINGS.map((label) => pickUnityWorktreeTint(label, SIBLINGS))
    )
  })

  it('still returns a colour when asked about the opted-out label itself', () => {
    // The return type is unchanged on purpose — callers gate on
    // `isUnityTintOptOut` rather than unwrapping a nullable tint.
    const tint = pickUnityWorktreeTint('beta', ['alpha', 'beta'], { beta: UNITY_TINT_OPT_OUT })
    expect(tint.hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('isValidUnityTintHex', () => {
  it('accepts exactly #rrggbb and nothing else', () => {
    expect(isValidUnityTintHex('#a6e3a1')).toBe(true)
    expect(isValidUnityTintHex('#A6E3A1')).toBe(true)
    expect(isValidUnityTintHex('#fff')).toBe(false)
    expect(isValidUnityTintHex('a6e3a1')).toBe(false)
    expect(isValidUnityTintHex('#a6e3a1ff')).toBe(false)
    expect(isValidUnityTintHex(undefined)).toBe(false)
  })

  it('rejects the opt-out marker', () => {
    // Load-bearing: the opt-out shares the override map with real colours, and
    // every "is this a manual colour?" gate in the codebase is this function.
    // The day this returns true, opted-out worktrees get painted '#none'.
    expect(isValidUnityTintHex(UNITY_TINT_OPT_OUT)).toBe(false)
    expect(isValidUnityTintHex('none')).toBe(false)
  })
})

describe('isUnityTintOptOut', () => {
  it("is true for exactly 'none' and nothing else", () => {
    expect(isUnityTintOptOut('none')).toBe(true)
    expect(isUnityTintOptOut(UNITY_TINT_OPT_OUT)).toBe(true)
    for (const value of ['None', 'NONE', ' none', 'none ', '', '#a6e3a1', undefined, null, 0]) {
      expect(isUnityTintOptOut(value)).toBe(false)
    }
  })
})

describe('unityToolbarPreviewHex', () => {
  it('returns a hex of the dark strip actually painted for the accent', () => {
    const preview = unityToolbarPreviewHex('#a6e3a1')
    expect(preview).toMatch(/^#[0-9a-f]{6}$/)
    const tint = pickUnityWorktreeTint('x', undefined, { x: '#a6e3a1' })
    expect(preview).toBe(
      `#${[tint.toolbarRgb.r, tint.toolbarRgb.g, tint.toolbarRgb.b]
        .map((value) =>
          Math.round(value * 255)
            .toString(16)
            .padStart(2, '0')
        )
        .join('')}`
    )
  })
})

describe('getUnityWorktreeTintAssignment', () => {
  const CASES: { name: string; labels: string[]; overrides?: Record<string, string> }[] = [
    { name: 'no siblings', labels: [] },
    { name: 'one sibling', labels: ['solo'] },
    { name: 'a handful', labels: SIBLINGS },
    { name: 'duplicates', labels: ['dup', 'dup', 'other'] },
    {
      name: 'manual picks among automatic ones',
      labels: [...SIBLINGS, 'manual'],
      overrides: { manual: '#f38ba8', 'feature-b': '#a6e3a1' }
    },
    {
      name: 'a dead override that must not reserve a colour',
      labels: SIBLINGS,
      overrides: { 'deleted-worktree': '#f38ba8' }
    },
    {
      name: 'more worktrees than colours',
      labels: Array.from({ length: 25 }, (_, index) => `wt-${index}`)
    }
  ]

  // The whole point of the table: it must not be a second, drifting answer.
  it.each(CASES)('matches pickUnityWorktreeTint for $name', ({ labels, overrides }) => {
    const assignment = getUnityWorktreeTintAssignment(labels, overrides)
    expect([...assignment.keys()].sort()).toEqual([...new Set(labels)].sort())
    for (const label of new Set(labels)) {
      expect(assignment.get(label)).toEqual(pickUnityWorktreeTint(label, labels, overrides))
    }
  })

  const OPT_OUT_CASES: { name: string; labels: string[]; overrides: Record<string, string> }[] = [
    {
      name: 'one opted-out sibling among automatics',
      labels: SIBLINGS,
      overrides: { 'feature-b': UNITY_TINT_OPT_OUT }
    },
    {
      name: 'opted out beside a hand-picked colour',
      labels: [...SIBLINGS, 'manual'],
      overrides: { manual: '#f38ba8', 'feature-a': UNITY_TINT_OPT_OUT }
    },
    {
      name: 'the only sibling opted out',
      labels: ['solo'],
      overrides: { solo: UNITY_TINT_OPT_OUT }
    },
    {
      name: 'every sibling opted out',
      labels: SIBLINGS,
      overrides: Object.fromEntries(SIBLINGS.map((label) => [label, UNITY_TINT_OPT_OUT]))
    },
    {
      name: 'a dead opt-out that names nobody',
      labels: SIBLINGS,
      overrides: { 'deleted-worktree': UNITY_TINT_OPT_OUT }
    }
  ]

  // A peer reads this table: an opted-out label must be ABSENT, and everyone
  // else must match the one-shot answer exactly.
  it.each(OPT_OUT_CASES)('omits opted-out labels for $name', ({ labels, overrides }) => {
    const assignment = getUnityWorktreeTintAssignment(labels, overrides)
    const coloured = [...new Set(labels)].filter((label) => !isUnityTintOptOut(overrides[label]))
    expect([...assignment.keys()].sort()).toEqual([...coloured].sort())
    for (const label of coloured) {
      expect(assignment.get(label)).toEqual(pickUnityWorktreeTint(label, labels, overrides))
    }
  })

  it('hands the same table back for an equal sibling set built fresh', () => {
    const first = getUnityWorktreeTintAssignment([...SIBLINGS], { 'feature-a': '#f38ba8' })
    const second = getUnityWorktreeTintAssignment([...SIBLINGS], { 'feature-a': '#f38ba8' })
    expect(second).toBe(first)
  })

  it('rebuilds when the sibling set or the overrides actually change', () => {
    const base = getUnityWorktreeTintAssignment(SIBLINGS)
    expect(getUnityWorktreeTintAssignment([...SIBLINGS, 'feature-d'])).not.toBe(base)
    expect(getUnityWorktreeTintAssignment(SIBLINGS, { 'feature-a': '#f38ba8' })).not.toBe(base)
  })

  it('keeps sibling sets apart when a folder name contains the separator', () => {
    const left = getUnityWorktreeTintAssignment(['a b', 'c'])
    const right = getUnityWorktreeTintAssignment(['a', 'b c'])
    expect(left).not.toBe(right)
    expect([...left.keys()]).toEqual(['a b', 'c'])
    expect([...right.keys()]).toEqual(['a', 'b c'])
  })
})
