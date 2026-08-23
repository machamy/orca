// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import {
  UNITY_TINT_ALL_COLORS,
  UNITY_TINT_FALLBACK_PALETTE,
  UNITY_TINT_PALETTE,
  pickUnityWorktreeTint
} from '../../../../shared/unity-worktree-tint-palette'
import {
  applyWorktreeTint,
  createAppStoreMock,
  createButtonMock,
  createDialogMock,
  createDropdownMenuMock,
  createHarness,
  createI18nMock,
  createSonnerMock,
  flush,
  makeRepo,
  makeWorktree,
  resetUnityMenuMocks,
  updateRepo
} from './worktree-unity-menu-test-harness'

vi.mock('@/components/ui/dropdown-menu', () => createDropdownMenuMock())
vi.mock('@/components/ui/dialog', () => createDialogMock())
vi.mock('@/components/ui/button', () => createButtonMock())
vi.mock('@/i18n/i18n', () => createI18nMock())
vi.mock('sonner', () => createSonnerMock())
vi.mock('@/store', () => createAppStoreMock())

// Imported AFTER the harness on purpose: the mock factories above read the
// harness namespace, which must be fully initialized before this pulls the
// mocked modules in.
import { useUnityWorktreeMenu } from './worktree-unity-menu'

const Harness = createHarness(useUnityWorktreeMenu)

beforeEach(resetUnityMenuMocks)
afterEach(cleanup)

describe('useUnityWorktreeMenu tint colour submenu', () => {
  const sibling = makeWorktree({ id: 'r1::/wt/other', path: '/wt/other' })
  const subcontent = (): HTMLElement => screen.getByTestId('tint-subcontent')

  it('offers automatic, every palette colour, and a custom entry — side rows only', async () => {
    const { rerender } = render(<Harness />)
    await flush()
    const rows = within(subcontent()).getAllByText(/./, { selector: '[role="menuitem"]' })
    // Automatic + BOTH tiers (10 + 10) + Custom. The second tier is what a
    // worktree gets handed automatically once the first is claimed, so a user
    // who wants to pick by hand has to be able to see it too.
    expect(rows).toHaveLength(UNITY_TINT_ALL_COLORS.length + 2)

    rerender(<Harness worktree={makeWorktree({ path: '/repo', id: 'r1::/repo' })} />)
    await flush()
    expect(screen.queryByTestId('tint-subcontent')).toBeNull()
  })

  it('lists every colour in palette order, second tier behind its own heading', async () => {
    render(<Harness />)
    await flush()
    const rows = within(subcontent()).getAllByText(/./, { selector: '[role="menuitem"]' })
    expect(rows.map((row) => row.textContent)).toEqual([
      'Automatic',
      ...UNITY_TINT_ALL_COLORS.map((entry) => entry.name),
      'Custom Color…'
    ])
    expect(screen.getByTestId('tint-group-label').textContent).toBe('More Colors')
  })

  it('stores a second-tier choice and re-writes the script with it', async () => {
    render(<Harness allWorktrees={[makeWorktree(), sibling]} />)
    await flush()
    // Iris is a fallback-tier colour: unreachable from the menu before the fix.
    fireEvent.click(within(subcontent()).getByText('Iris'))
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      unityTintOverrides: { feature: '#afa4ea' }
    })
    expect(applyWorktreeTint).toHaveBeenCalledWith({
      worktreePath: '/wt/feature',
      enabled: true,
      tintSiblingLabels: ['feature', 'other'],
      tintOverridesByLabel: { feature: '#afa4ea' }
    })
  })

  it('shows the check on a stored second-tier pick and names it, never "Custom"', async () => {
    render(
      <Harness
        repo={makeRepo({ unityTintOverrides: { feature: '#eaa8a4' } } as Partial<Repo>)}
        allWorktrees={[makeWorktree(), sibling]}
      />
    )
    await flush()
    // The combined list resolves fallback hexes, so the tint carries a real name.
    expect(pickUnityWorktreeTint('feature', ['feature'], { feature: '#eaa8a4' }).name).toBe('Coral')
    const coral = within(subcontent()).getByText('Coral').closest('[role="menuitem"]')
    expect(coral?.querySelector('svg')).toBeTruthy()
    expect(coral?.getAttribute('aria-disabled')).toBe('false')
  })

  it("disables a second-tier colour another worktree's override already uses", async () => {
    render(
      <Harness
        repo={makeRepo({ unityTintOverrides: { other: '#a4eabe' } } as Partial<Repo>)}
        allWorktrees={[makeWorktree(), sibling]}
      />
    )
    await flush()
    const mint = within(subcontent()).getByText(/Mint/).closest('[role="menuitem"]')
    expect(mint?.getAttribute('aria-disabled')).toBe('true')
    expect(mint?.textContent).toContain('(in use)')
    fireEvent.click(mint as HTMLElement)
    await flush()
    expect(updateRepo).not.toHaveBeenCalled()
  })

  it('leaves a second-tier colour a sibling only holds automatically selectable', async () => {
    // Eleven worktrees push the automatic assignment into the fallback tier;
    // those colours must still be takeable, exactly like the primaries.
    const many = Array.from({ length: 11 }, (_, index) =>
      makeWorktree({ id: `r1::/wt/w${index}`, path: `/wt/w${index}` })
    )
    const all = [makeWorktree(), ...many]
    const labels = all.map((entry) => entry.path.split('/').at(-1) as string)
    const fallbackHexes = new Set(UNITY_TINT_FALLBACK_PALETTE.map((entry) => entry.hex))
    const autoFallback = labels
      .filter((label) => label !== 'feature')
      .map((label) => pickUnityWorktreeTint(label, labels).hex)
      .find((hex) => fallbackHexes.has(hex))
    expect(autoFallback).toBeDefined()

    render(<Harness allWorktrees={all} />)
    await flush()
    const name = UNITY_TINT_ALL_COLORS.find((entry) => entry.hex === autoFallback)?.name as string
    fireEvent.click(within(subcontent()).getByText(name))
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      unityTintOverrides: { feature: autoFallback }
    })
  })

  it('hides the submenu entirely when the repo turned the tint off', async () => {
    render(<Harness repo={makeRepo({ unityWorktreeTint: false } as Partial<Repo>)} />)
    await flush()
    expect(screen.queryByTestId('tint-subtrigger')).toBeNull()
  })

  it('stores a preset choice and re-writes the script with the exact payload', async () => {
    render(<Harness allWorktrees={[makeWorktree(), sibling]} />)
    await flush()
    fireEvent.click(within(subcontent()).getByText('Green'))
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      unityTintOverrides: { feature: '#a6e3a1' }
    })
    expect(applyWorktreeTint).toHaveBeenCalledWith({
      worktreePath: '/wt/feature',
      enabled: true,
      tintSiblingLabels: ['feature', 'other'],
      tintOverridesByLabel: { feature: '#a6e3a1' }
    })
  })

  it("disables a colour another worktree's override already uses", async () => {
    render(
      <Harness
        repo={makeRepo({ unityTintOverrides: { other: '#f38ba8' } } as Partial<Repo>)}
        allWorktrees={[makeWorktree(), sibling]}
      />
    )
    await flush()
    const red = within(subcontent()).getByText(/Red/).closest('[role="menuitem"]')
    expect(red?.getAttribute('aria-disabled')).toBe('true')
    expect(red?.textContent).toContain('(in use)')
    fireEvent.click(red as HTMLElement)
    await flush()
    expect(updateRepo).not.toHaveBeenCalled()
  })

  it('Automatic removes only this worktree from the stored overrides', async () => {
    render(
      <Harness
        repo={makeRepo({
          unityTintOverrides: { feature: '#89b4fa', other: '#f38ba8' }
        } as Partial<Repo>)}
        allWorktrees={[makeWorktree(), sibling]}
      />
    )
    await flush()
    fireEvent.click(within(subcontent()).getByText('Automatic'))
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      unityTintOverrides: { other: '#f38ba8' }
    })
  })

  it('applies a custom colour from the picker dialog', async () => {
    const pending = vi.fn()
    render(<Harness onPending={pending} />)
    await flush()
    fireEvent.click(within(subcontent()).getByText('Custom Color…'))
    await flush()
    expect(pending).toHaveBeenLastCalledWith(true)
    const input = screen.getByLabelText('Custom Unity Toolbar Color')
    fireEvent.change(input, { target: { value: '#123456' } })
    fireEvent.click(screen.getByText('Apply'))
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      unityTintOverrides: { feature: '#123456' }
    })
    expect(applyWorktreeTint).toHaveBeenCalledWith({
      worktreePath: '/wt/feature',
      enabled: true,
      tintSiblingLabels: ['feature'],
      tintOverridesByLabel: { feature: '#123456' }
    })
    expect(pending).toHaveBeenLastCalledWith(false)
  })

  it('stores an override for a worktree folder literally named __proto__', async () => {
    // Plain assignment would hit Object.prototype's setter and store nothing.
    const odd = makeWorktree({ id: 'r1::/wt/__proto__', path: '/wt/__proto__' })
    render(<Harness worktree={odd} allWorktrees={[odd]} />)
    await flush()
    fireEvent.click(within(subcontent()).getByText('Green'))
    await flush()
    const stored = updateRepo.mock.calls.at(-1)?.[1].unityTintOverrides
    expect(Object.hasOwn(stored, '__proto__')).toBe(true)
    expect(stored['__proto__']).toBe('#a6e3a1')
    // And it survives the JSON trip the repo record takes to disk.
    expect(JSON.parse(JSON.stringify(stored))['__proto__']).toBe('#a6e3a1')
  })

  it("blocks a duplicate even when it is this worktree's own current pick", async () => {
    // Past the palette size the automatic assignment runs out of free slots and
    // can land on a colour an override already holds — no exception for "mine".
    render(
      <Harness
        repo={makeRepo({
          unityTintOverrides: { feature: '#f38ba8', other: '#f38ba8' }
        } as Partial<Repo>)}
        allWorktrees={[makeWorktree(), sibling]}
      />
    )
    await flush()
    const red = within(subcontent()).getByText(/Red/).closest('[role="menuitem"]')
    expect(red?.textContent).toContain('(in use)')
    expect(red?.getAttribute('aria-disabled')).toBe('true')
  })

  it('rewrites a sibling whose automatic colour moved because of this choice', async () => {
    // Releasing an override frees a palette slot; whichever sibling shifts must
    // get its script rewritten now, or two open editors keep the same colour.
    const siblings = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].map((name) =>
      makeWorktree({ id: `r1::/wt/${name}`, path: `/wt/${name}` })
    )
    const all = [makeWorktree(), ...siblings]
    const labels = all.map((entry) => entry.path.split('/').at(-1) as string)
    const moved = labels.filter(
      (label) =>
        label !== 'feature' &&
        pickUnityWorktreeTint(label, labels, { feature: '#123456' }).hex !==
          pickUnityWorktreeTint(label, labels).hex
    )
    expect(moved.length).toBeGreaterThan(0)

    render(
      <Harness
        repo={makeRepo({ unityTintOverrides: { feature: '#123456' } } as Partial<Repo>)}
        allWorktrees={all}
      />
    )
    await flush()
    fireEvent.click(within(subcontent()).getByText('Automatic'))
    await flush()

    const rewritten = applyWorktreeTint.mock.calls.map(
      (call) => call[0].worktreePath.split('/').at(-1) as string
    )
    expect(rewritten).toContain('feature')
    for (const label of moved) {
      expect(rewritten).toContain(label)
    }
    // Untouched siblings stay untouched — no needless domain reloads.
    for (const label of labels.filter((label) => label !== 'feature' && !moved.includes(label))) {
      expect(rewritten).not.toContain(label)
    }
  })

  it('never sends a remote sibling path to the local tint writer', async () => {
    // applyWorktreeTint writes on this machine; an SSH row's path names a file
    // on another one. It may still take part in the colour maths (that filter
    // lives in the parent), but it must never be written to.
    const remote = makeWorktree({
      id: 'r1::/srv/remote-wt',
      path: '/srv/remote-wt',
      hostId: 'ssh:box'
    } as Partial<Worktree>)
    const local = makeWorktree({ id: 'r1::/wt/local-wt', path: '/wt/local-wt' })
    render(
      <Harness
        repo={makeRepo({ unityTintOverrides: { feature: '#123456' } } as Partial<Repo>)}
        allWorktrees={[makeWorktree(), local, remote]}
      />
    )
    await flush()
    fireEvent.click(within(subcontent()).getByText('Automatic'))
    await flush()

    const written = applyWorktreeTint.mock.calls.map((call) => call[0].worktreePath as string)
    expect(written).toContain('/wt/feature')
    expect(written).not.toContain('/srv/remote-wt')
  })

  it('derives the label from a Windows path with a trailing separator', async () => {
    const win = makeWorktree({ id: 'r1::win', path: 'C:\\wt\\feature-win\\' } as Partial<Worktree>)
    render(<Harness worktree={win} allWorktrees={[win]} />)
    await flush()
    fireEvent.click(within(subcontent()).getByText('Green'))
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      unityTintOverrides: { 'feature-win': '#a6e3a1' }
    })
  })

  it('refuses a custom colour a sibling deliberately picked', async () => {
    render(
      <Harness
        repo={makeRepo({ unityTintOverrides: { other: '#123456' } } as Partial<Repo>)}
        allWorktrees={[makeWorktree(), sibling]}
      />
    )
    await flush()
    fireEvent.click(within(subcontent()).getByText('Custom Color…'))
    await flush()
    fireEvent.change(screen.getByLabelText('Custom Unity Toolbar Color'), {
      target: { value: '#123456' }
    })
    expect(screen.getByText(/already uses this color/)).toBeTruthy()
    expect((screen.getByText('Apply') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByText('Apply'))
    await flush()
    expect(updateRepo).not.toHaveBeenCalled()
    expect(applyWorktreeTint).not.toHaveBeenCalled()
  })

  it('allows taking a colour a sibling only holds automatically', async () => {
    // Regression: blocking automatic colours too left every preset disabled on a
    // repo with as many worktrees as the palette has colours — nothing was
    // selectable. The automatic sibling moves aside instead.
    const siblingAutoHex = pickUnityWorktreeTint('other', ['feature', 'other']).hex
    render(<Harness allWorktrees={[makeWorktree(), sibling]} />)
    await flush()
    fireEvent.click(within(subcontent()).getByText('Custom Color…'))
    await flush()
    fireEvent.change(screen.getByLabelText('Custom Unity Toolbar Color'), {
      target: { value: siblingAutoHex }
    })
    expect(screen.queryByText(/already uses this color/)).toBeNull()
    fireEvent.click(screen.getByText('Apply'))
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      unityTintOverrides: { feature: siblingAutoHex }
    })
    // The displaced sibling gets its script rewritten in the same pass.
    const written = applyWorktreeTint.mock.calls.map((call) => call[0].worktreePath as string)
    expect(written).toContain('/wt/other')
  })

  it('leaves every preset selectable when the palette is saturated', async () => {
    // The real repro: eleven worktrees, ten colours. Before the fix all ten
    // presets read "(in use)" and the menu was inert.
    const many = Array.from({ length: 11 }, (_, index) =>
      makeWorktree({ id: `r1::/wt/w${index}`, path: `/wt/w${index}` })
    )
    render(<Harness allWorktrees={[makeWorktree(), ...many]} />)
    await flush()
    const rows = within(subcontent()).getAllByText(/./, { selector: '[role="menuitem"]' })
    const blocked = rows.filter((row) => row.getAttribute('aria-disabled') === 'true')
    expect(blocked).toHaveLength(0)
  })

  it('still offers the second tier once every primary is deliberately claimed', async () => {
    // Ten siblings, each having picked a different primary by hand. Without the
    // second tier on the menu every row would read "(in use)" and the only way
    // out would be the custom picker.
    const siblings = UNITY_TINT_PALETTE.map((_, index) =>
      makeWorktree({ id: `r1::/wt/p${index}`, path: `/wt/p${index}` })
    )
    const overrides = Object.fromEntries(
      UNITY_TINT_PALETTE.map((entry, index) => [`p${index}`, entry.hex])
    )
    render(
      <Harness
        repo={makeRepo({ unityTintOverrides: overrides } as Partial<Repo>)}
        allWorktrees={[makeWorktree(), ...siblings]}
      />
    )
    await flush()
    const rows = within(subcontent()).getAllByText(/./, { selector: '[role="menuitem"]' })
    const selectable = rows.filter((row) => row.getAttribute('aria-disabled') !== 'true')
    // Automatic + all ten fallback colours + Custom.
    expect(selectable).toHaveLength(UNITY_TINT_FALLBACK_PALETTE.length + 2)

    fireEvent.click(within(subcontent()).getByText('Amber'))
    await flush()
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      unityTintOverrides: { ...overrides, feature: '#eac9a4' }
    })
  })
})
