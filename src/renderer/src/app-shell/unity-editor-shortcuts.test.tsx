// @vitest-environment happy-dom

// Fork contract: "Open in Unity" / "Open in Rider" from the keyboard must behave
// exactly like the worktree menu entries (plan machamy.8, C1–C6).
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  KEYBINDING_DEFINITIONS,
  findKeybindingConflicts,
  formatKeybindingList,
  getEffectiveKeybindingsForAction,
  keybindingMatchesAction
} from '../../../shared/keybindings'
import { groupDefinitions } from '../components/settings/shortcut-groups'
import { shouldOfferUnityCacheCopy } from '../components/sidebar/unity-cache-copy-offer'
import { unityFocusFailureMessage } from '../components/sidebar/unity-focus-failure-message'
import { isLocallyRunnableUnityWorkspace } from '../../../shared/unity-repo-eligibility'
import type { Repo } from '../../../shared/repo-types'
import type { UnityWorktreeStatus } from '../../../shared/unity-worktree'
import type { Worktree } from '../../../shared/worktree/types'
import type { ActivePluginCommand } from '../store/plugin-panels'
import { matchUnityEditorShortcut } from './unity-editor-shortcut-match'

const UNITY_CHORD = { key: 'u', code: 'KeyU', control: true, alt: true, meta: false, shift: false }
const RIDER_CHORD = { key: 'r', code: 'KeyR', control: true, alt: true, meta: false, shift: false }

describe('Unity editor shortcut registry', () => {
  it('registers both actions so Settings can list and rebind them (C1)', () => {
    const ids = KEYBINDING_DEFINITIONS.map((definition) => definition.id)
    expect(ids).toContain('unity.openEditor')
    expect(ids).toContain('unity.openRider')

    const globalGroup = groupDefinitions([]).find((group) => group.title === 'Global')
    expect(globalGroup?.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['unity.openEditor', 'unity.openRider'])
    )

    // A user override completely replaces the default, on every platform.
    expect(
      getEffectiveKeybindingsForAction('unity.openEditor', 'linux', {
        'unity.openEditor': ['Mod+Shift+U']
      })
    ).toEqual(['Mod+Shift+U'])
    expect(
      keybindingMatchesAction('unity.openEditor', UNITY_CHORD, 'linux', {
        'unity.openEditor': ['Mod+Shift+U']
      })
    ).toBe(false)
  })

  it('keeps the default chords conflict-free on all three platforms (C2)', () => {
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      expect(findKeybindingConflicts(platform)).toEqual([])
      expect(getEffectiveKeybindingsForAction('unity.openEditor', platform)).toEqual(['Ctrl+Alt+U'])
    }
    // Rider's launcher is darwin-only (findRiderAppPath); a default chord on
    // Windows/Linux would be consumed just to no-op, so only macOS ships one.
    expect(getEffectiveKeybindingsForAction('unity.openRider', 'darwin')).toEqual(['Ctrl+Alt+R'])
    expect(getEffectiveKeybindingsForAction('unity.openRider', 'linux')).toEqual([])
    expect(getEffectiveKeybindingsForAction('unity.openRider', 'win32')).toEqual([])
  })

  it('labels the chord with platform glyphs (C3)', () => {
    // Literal Ctrl, not Mod: on macOS that is Control+Option (⌃⌥), which is the
    // binding the owner picked precisely to leave ⌘⌥ alone.
    expect(formatKeybindingList(['Ctrl+Alt+U'], 'darwin')).toBe('⌃⌥U')
    expect(formatKeybindingList(['Ctrl+Alt+R'], 'win32')).toBe('Ctrl+Alt+R')
    expect(formatKeybindingList(['Ctrl+Alt+R'], 'linux')).toBe('Ctrl+Alt+R')
  })

  it('never fires with terminal focus, under either policy — AltGr must stay text', () => {
    for (const policy of ['orca-first', 'terminal-first'] as const) {
      const terminal = { context: 'terminal', terminalShortcutPolicy: policy } as const
      expect(matchUnityEditorShortcut(UNITY_CHORD, 'linux', undefined, terminal)).toBeNull()
      expect(matchUnityEditorShortcut(RIDER_CHORD, 'win32', undefined, terminal)).toBeNull()
    }
    // App focus is untouched, whatever the terminal policy says.
    expect(
      matchUnityEditorShortcut(UNITY_CHORD, 'linux', undefined, {
        context: 'app',
        terminalShortcutPolicy: 'terminal-first'
      })
    ).toBe('unity')
  })

  it('routes each chord to its own action and nothing else', () => {
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      expect(matchUnityEditorShortcut(UNITY_CHORD, platform)).toBe('unity')
      expect(matchUnityEditorShortcut({ ...UNITY_CHORD, alt: false }, platform)).toBeNull()
    }
    // Rider fires by default only where its launcher exists; elsewhere the
    // chord stays free unless the user binds it themselves.
    expect(matchUnityEditorShortcut(RIDER_CHORD, 'darwin')).toBe('rider')
    expect(matchUnityEditorShortcut(RIDER_CHORD, 'linux')).toBeNull()
    expect(matchUnityEditorShortcut(RIDER_CHORD, 'win32')).toBeNull()
    expect(
      matchUnityEditorShortcut(RIDER_CHORD, 'linux', { 'unity.openRider': ['Ctrl+Alt+R'] })
    ).toBe('rider')
  })
})

describe('Unity shortcut eligibility (C5)', () => {
  const localWorktree = { hostId: 'local' } as Pick<Worktree, 'hostId'>
  const gitRepo = {
    kind: 'git',
    connectionId: undefined,
    executionHostId: null
  } as unknown as Repo

  it('covers local git repos only — SSH, runtime hosts and folder workspaces are out', () => {
    expect(isLocallyRunnableUnityWorkspace(localWorktree, gitRepo)).toBe(true)
    expect(isLocallyRunnableUnityWorkspace({ hostId: 'ssh:synthetic-host' }, gitRepo)).toBe(false)
    expect(
      isLocallyRunnableUnityWorkspace(localWorktree, { ...gitRepo, connectionId: 'ssh-1' })
    ).toBe(false)
    expect(
      isLocallyRunnableUnityWorkspace(localWorktree, {
        ...gitRepo,
        executionHostId: 'runtime:synthetic'
      })
    ).toBe(false)
    expect(
      isLocallyRunnableUnityWorkspace(localWorktree, { ...gitRepo, kind: 'folder' } as Repo)
    ).toBe(false)
    expect(isLocallyRunnableUnityWorkspace(null, gitRepo)).toBe(false)
  })
})

describe('cache-copy offer (C6 decision)', () => {
  const base: UnityWorktreeStatus = {
    isUnityProject: true,
    editorVersion: '2020.1.0f1',
    editorInstalled: true,
    worktreeHasLibrary: false,
    sourceHasLibrary: true,
    riderInstalled: false
  }

  it('offers only when the worktree has no cache and the source does', () => {
    expect(shouldOfferUnityCacheCopy(base, false)).toBe(true)
    expect(shouldOfferUnityCacheCopy({ ...base, worktreeHasLibrary: true }, false)).toBe(false)
    expect(shouldOfferUnityCacheCopy({ ...base, sourceHasLibrary: false }, false)).toBe(false)
    // The default checkout IS the donor.
    expect(shouldOfferUnityCacheCopy(base, true)).toBe(false)
    expect(shouldOfferUnityCacheCopy(null, false)).toBe(false)
  })
})

describe('focus-failure copy', () => {
  it('names the pid in every variant with a known pid; exactly one variant mentions each permission', () => {
    // STYLEGUIDE: UI copy must not overclaim. A missing xdotool, a Wayland
    // session and a refused foreground change are not permission problems —
    // and -25211 is an ACCESSIBILITY denial, so its copy must not send the
    // user to the Automation pane (or vice versa).
    const reasons = [
      'permission_denied_automation',
      'permission_denied_accessibility',
      'no_window',
      'tool_missing',
      'unsupported_session',
      'refused'
    ] as const
    const messages = reasons.map((reason) => unityFocusFailureMessage(9182, reason, 'why'))

    for (const message of messages) {
      expect(message).toContain('9182')
    }
    expect(messages.filter((message) => /Automation/i.test(message))).toHaveLength(1)
    expect(messages.filter((message) => /Accessibility/i.test(message))).toHaveLength(1)
    const automation = unityFocusFailureMessage(9182, 'permission_denied_automation', '')
    const accessibility = unityFocusFailureMessage(9182, 'permission_denied_accessibility', '')
    expect(automation).toMatch(/Automation/)
    expect(automation).not.toMatch(/Accessibility/)
    expect(accessibility).toMatch(/Accessibility/)
    expect(accessibility).not.toMatch(/Automation/)
    expect(unityFocusFailureMessage(9182, 'tool_missing', '')).toMatch(/xdotool/)
    expect(unityFocusFailureMessage(9182, 'tool_missing', '')).not.toMatch(/permission/i)
    // An absent pid still produces a sentence, never "pid undefined".
    expect(unityFocusFailureMessage(undefined, 'refused', 'why')).not.toContain('undefined')
  })

  it('the pid-less still-starting variant claims no pid at all', () => {
    // The recent-launch guard reports no_window WITHOUT a pid (the editor it
    // spawned is not in the process table yet); "pid ?" would be a lie.
    const message = unityFocusFailureMessage(undefined, 'no_window', undefined)
    expect(message).toMatch(/starting up/)
    expect(message).not.toMatch(/pid/i)
    expect(message).not.toContain('?)')
    expect(message).not.toContain('undefined')
    // A no_window WITH a pid keeps naming it — that process really exists.
    expect(unityFocusFailureMessage(4321, 'no_window', undefined)).toContain('4321')
  })
})

// ─── Mounted behaviour ──────────────────────────────────────────────
type SelectorState = {
  activeWorktree: Worktree | null
  repo: Repo | null
}

const selectorState: SelectorState = { activeWorktree: null, repo: null }

vi.mock('../store/selectors', () => ({
  useActiveWorktree: () => selectorState.activeWorktree,
  useRepoById: () => selectorState.repo,
  useAllWorktrees: () => (selectorState.activeWorktree ? [selectorState.activeWorktree] : [])
}))

let deleteStateByWorktreeId: Record<string, { isDeleting?: boolean }> = {}

const storeState = (): Record<string, unknown> => ({
  keybindings: undefined,
  settings: undefined,
  markUnityProjectRepoDetected: () => {},
  deleteStateByWorktreeId
})

vi.mock('../store', () => ({
  useAppStore: Object.assign(
    (select: (state: Record<string, unknown>) => unknown) => select(storeState()),
    { getState: () => storeState() }
  )
}))

let activePluginCommands: ActivePluginCommand[] = []

vi.mock('../store/plugin-panels', () => ({
  usePluginCommands: () => activePluginCommands
}))

function pluginCommandFixture(chord: string): ActivePluginCommand {
  return {
    id: 'synthetic-command',
    title: 'Synthetic command',
    context: 'global',
    handler: { type: 'worker' },
    keybindings: [{ key: chord, when: 'global' }],
    pluginKey: 'synthetic.plugin',
    pluginName: 'Synthetic Plugin'
  } as ActivePluginCommand
}

const unityApi = {
  worktreeStatus: vi.fn(),
  openProject: vi.fn(),
  openInRider: vi.fn(),
  seedWorktreeCache: vi.fn()
}

function worktreeFixture(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'wt-shortcut',
    repoId: 'repo-shortcut',
    path: '/synthetic/checkouts/feature-row',
    branch: 'feature-row',
    isMainWorktree: false,
    hostId: 'local',
    ...overrides
  } as unknown as Worktree
}

function repoFixture(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-shortcut',
    path: '/synthetic/checkouts/default-row',
    name: 'synthetic-project',
    kind: 'git',
    ...overrides
  } as unknown as Repo
}

function unityStatus(overrides: Partial<UnityWorktreeStatus> = {}): UnityWorktreeStatus {
  return {
    isUnityProject: true,
    editorVersion: '2020.1.0f1',
    editorInstalled: true,
    worktreeHasLibrary: true,
    sourceHasLibrary: true,
    riderInstalled: true,
    ...overrides
  }
}

let container: HTMLDivElement
let root: Root

async function mountShortcuts(): Promise<void> {
  const { UnityEditorShortcuts } = await import('./UnityEditorShortcuts')
  await act(async () => {
    root.render(<UnityEditorShortcuts />)
  })
}

async function pressChord(init: KeyboardEventInit, target?: EventTarget): Promise<void> {
  await act(async () => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    ;(target ?? window).dispatchEvent(event)
    await Promise.resolve()
    await Promise.resolve()
  })
}

const UNITY_KEY_EVENT: KeyboardEventInit = {
  key: 'u',
  code: 'KeyU',
  ctrlKey: true,
  altKey: true
}
const RIDER_KEY_EVENT: KeyboardEventInit = {
  key: 'r',
  code: 'KeyR',
  ctrlKey: true,
  altKey: true
}

beforeEach(() => {
  Object.values(unityApi).forEach((mock) => mock.mockReset())
  unityApi.openProject.mockResolvedValue({ opened: true })
  unityApi.openInRider.mockResolvedValue({ opened: true, target: 'solution' })
  ;(window as unknown as { api: unknown }).api = { unity: unityApi }
  // Mac branch of getShortcutPlatform(); the chord is the same string anyway.
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    configurable: true
  })
  selectorState.activeWorktree = worktreeFixture()
  selectorState.repo = repoFixture()
  deleteStateByWorktreeId = {}
  activePluginCommands = []
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
})

describe('UnityEditorShortcuts (mounted)', () => {
  it('opens the ACTIVE worktree, probing it first (C4)', async () => {
    unityApi.worktreeStatus.mockResolvedValue(unityStatus())
    await mountShortcuts()

    await pressChord(UNITY_KEY_EVENT)

    expect(unityApi.worktreeStatus).toHaveBeenCalledWith({
      worktreePath: '/synthetic/checkouts/feature-row',
      sourcePath: '/synthetic/checkouts/default-row'
    })
    expect(unityApi.openProject).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/synthetic/checkouts/feature-row' })
    )
  })

  it('does nothing at all on a non-Unity or ineligible workspace (C5)', async () => {
    unityApi.worktreeStatus.mockResolvedValue(unityStatus({ isUnityProject: false }))
    await mountShortcuts()
    await pressChord(UNITY_KEY_EVENT)
    expect(unityApi.openProject).not.toHaveBeenCalled()

    // An SSH-hosted row never even probes — same condition that hides the menu.
    selectorState.activeWorktree = worktreeFixture({ hostId: 'ssh:synthetic-host' })
    unityApi.worktreeStatus.mockClear()
    await mountShortcuts()
    await pressChord(UNITY_KEY_EVENT)
    expect(unityApi.worktreeStatus).not.toHaveBeenCalled()
  })

  it('does nothing while the active worktree is being deleted', async () => {
    // Same gate as the menu, whose Unity entries disable on isDeleting: a
    // launch racing the delete would open an editor on a vanishing checkout.
    unityApi.worktreeStatus.mockResolvedValue(unityStatus())
    deleteStateByWorktreeId = { 'wt-shortcut': { isDeleting: true } }
    await mountShortcuts()

    await pressChord(UNITY_KEY_EVENT)
    await pressChord(RIDER_KEY_EVENT)

    expect(unityApi.worktreeStatus).not.toHaveBeenCalled()
    expect(unityApi.openProject).not.toHaveBeenCalled()
    expect(unityApi.openInRider).not.toHaveBeenCalled()
  })

  it('raises the cache-copy dialog instead of opening blind (C6)', async () => {
    unityApi.worktreeStatus.mockResolvedValue(unityStatus({ worktreeHasLibrary: false }))
    await mountShortcuts()

    await pressChord(UNITY_KEY_EVENT)

    expect(unityApi.openProject).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Copy the Unity cache first?')
  })

  it('opens Rider on its own chord, and only when Rider is installed', async () => {
    unityApi.worktreeStatus.mockResolvedValue(unityStatus())
    await mountShortcuts()

    await pressChord(RIDER_KEY_EVENT)
    expect(unityApi.openInRider).toHaveBeenCalledWith({
      worktreePath: '/synthetic/checkouts/feature-row',
      sourcePath: '/synthetic/checkouts/default-row'
    })

    unityApi.openInRider.mockClear()
    unityApi.worktreeStatus.mockResolvedValue(unityStatus({ riderInstalled: false }))
    await pressChord(RIDER_KEY_EVENT)
    expect(unityApi.openInRider).not.toHaveBeenCalled()
  })

  it('leaves the chord to a text field — Ctrl+Alt is AltGr on Windows/Linux', async () => {
    unityApi.worktreeStatus.mockResolvedValue(unityStatus())
    await mountShortcuts()
    const input = document.createElement('input')
    document.body.appendChild(input)

    await pressChord(UNITY_KEY_EVENT, input)

    expect(unityApi.worktreeStatus).not.toHaveBeenCalled()
    input.remove()
  })

  it('leaves the chord to a focused terminal — AltGr typed into a shell', async () => {
    unityApi.worktreeStatus.mockResolvedValue(unityStatus())
    await mountShortcuts()
    // xterm's hidden textarea is exempt from isEditableTarget, so only the
    // terminal keybinding context can keep the chord out of this listener.
    const xterm = document.createElement('textarea')
    xterm.className = 'xterm-helper-textarea'
    document.body.appendChild(xterm)

    await pressChord(UNITY_KEY_EVENT, xterm)
    await pressChord(RIDER_KEY_EVENT, xterm)

    expect(unityApi.worktreeStatus).not.toHaveBeenCalled()
    xterm.remove()
  })

  it('aborts a launch when the delete began while the status probe ran', async () => {
    // The pre-probe gate sees a stale snapshot: a delete that starts during the
    // async worktreeStatus round-trip must still cancel the launch.
    let releaseStatus!: (status: UnityWorktreeStatus) => void
    unityApi.worktreeStatus.mockImplementation(
      () => new Promise<UnityWorktreeStatus>((resolve) => (releaseStatus = resolve))
    )
    await mountShortcuts()

    await pressChord(UNITY_KEY_EVENT)
    expect(unityApi.worktreeStatus).toHaveBeenCalled()
    deleteStateByWorktreeId = { 'wt-shortcut': { isDeleting: true } }
    await act(async () => {
      releaseStatus(unityStatus())
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(unityApi.openProject).not.toHaveBeenCalled()
    expect(unityApi.openInRider).not.toHaveBeenCalled()
  })

  it('yields a plugin-claimed chord — plugin priority survives listener registration order', async () => {
    // This capture listener can register BEFORE use-global-keybindings' (child
    // effects run before App's own). Documented priority says a user-approved
    // plugin chord wins in app focus, so the Unity handler must leave the event
    // alone: no launch, and no preventDefault (the global dispatch still needs
    // to see the chord to run the plugin command).
    activePluginCommands = [pluginCommandFixture('Ctrl+Alt+U')]
    unityApi.worktreeStatus.mockResolvedValue(unityStatus())
    await mountShortcuts()

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ...UNITY_KEY_EVENT
    })
    await act(async () => {
      window.dispatchEvent(event)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(unityApi.worktreeStatus).not.toHaveBeenCalled()
    expect(unityApi.openProject).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('still fires when the installed plugins claim OTHER chords', async () => {
    activePluginCommands = [pluginCommandFixture('Ctrl+Alt+P')]
    unityApi.worktreeStatus.mockResolvedValue(unityStatus())
    await mountShortcuts()

    await pressChord(UNITY_KEY_EVENT)

    expect(unityApi.openProject).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/synthetic/checkouts/feature-row' })
    )
  })

  it('stays quiet while the Settings shortcut recorder is capturing', async () => {
    unityApi.worktreeStatus.mockResolvedValue(unityStatus())
    await mountShortcuts()
    const recorder = document.createElement('button')
    recorder.setAttribute('data-shortcut-recorder-active', '')
    document.body.appendChild(recorder)

    await pressChord(UNITY_KEY_EVENT, recorder)
    await pressChord(RIDER_KEY_EVENT, recorder)

    expect(unityApi.worktreeStatus).not.toHaveBeenCalled()
    recorder.remove()
  })
})
