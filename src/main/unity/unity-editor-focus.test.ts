// Fork contract: opening a worktree whose Unity editor is already up must raise
// that window instead of starting a second editor (plan machamy.8, B1–B8).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findUnityEditorProcess,
  selectUnityEditorProcesses,
  type UnityProcessRow
} from './unity-editor-process-lookup'
import { focusUnityEditorWindow, type FocusCommandResult } from './unity-editor-window-focus'
import { openUnityProject } from './unity-project-worktree'

const roots: string[] = []

function makeUnityProject(version = '2020.1.0f1'): string {
  const root = mkdtempSync(join(tmpdir(), 'orca-unity-focus-'))
  roots.push(root)
  mkdirSync(join(root, 'ProjectSettings'), { recursive: true })
  writeFileSync(
    join(root, 'ProjectSettings', 'ProjectVersion.txt'),
    `m_EditorVersion: ${version}\n`
  )
  return root
}

const MAC_EDITOR = '/Applications/Unity/Hub/Editor/2020.1.0f1/Unity.app/Contents/MacOS/Unity'

function editorRow(projectPath: string, pid = 4242): UnityProcessRow {
  return { pid, command: `${MAC_EDITOR} -projectPath ${projectPath} -useHub -hubIPC` }
}

function importWorkerRow(projectPath: string, pid = 4343): UnityProcessRow {
  return {
    pid,
    command:
      `${MAC_EDITOR} -adb2 -batchMode -noUpm -name AssetImportWorker0 ` +
      `-projectPath ${projectPath} -logFile /dev/null -srvPort 55000`
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('selectUnityEditorProcesses', () => {
  it('picks the editor and carries its pid', () => {
    // B6 needs the pid: the failure popup has to name the window it could not raise.
    expect(selectUnityEditorProcesses([editorRow('/work/alpha', 900)], '/work/alpha')).toEqual([
      { pid: 900, command: expect.stringContaining('-projectPath /work/alpha') }
    ])
  })

  it('does NOT treat a -batchMode AssetImportWorker as an editor', () => {
    // B2: the seeding gate deliberately matches workers (a worker mid-import is
    // still writing the Library); a worker has no window to raise.
    expect(selectUnityEditorProcesses([importWorkerRow('/work/alpha')], '/work/alpha')).toEqual([])
  })

  it('ignores a sibling worktree whose path merely shares a prefix', () => {
    // B3: `/work/alpha` must not read as open because `/work/alpha-two` is.
    expect(
      selectUnityEditorProcesses(
        [editorRow('/work/alpha-two'), editorRow('/work/alphabet')],
        '/work/alpha'
      )
    ).toEqual([])
  })

  it('still matches a project path containing spaces', () => {
    const rows = [
      { pid: 12, command: `${MAC_EDITOR} -projectPath /work/my project -logFile /dev/null` }
    ]
    expect(selectUnityEditorProcesses(rows, '/work/my project')).toHaveLength(1)
    expect(selectUnityEditorProcesses(rows, '/work/my')).toEqual([])
  })

  it('rejects a non-Unity process that merely quotes the flag', () => {
    const rows = [{ pid: 77, command: 'some-agent "look at -projectPath /work/alpha for me"' }]
    expect(selectUnityEditorProcesses(rows, '/work/alpha')).toEqual([])
  })

  it('prefers the exact-case project over a case-folded alias', () => {
    // Case-sensitive APFS can hold two projects differing only by case; when both
    // editors are up, the exact launch arg must pick the right pid.
    const rows = [editorRow('/work/Alpha', 111), editorRow('/work/alpha', 222)]
    expect(selectUnityEditorProcesses(rows, '/work/alpha')[0]?.pid).toBe(222)
    expect(selectUnityEditorProcesses(rows, '/work/Alpha')[0]?.pid).toBe(111)
  })

  it('does not alias a case-different project when it is the only candidate', () => {
    // Case-sensitive APFS: /work/Alpha and /work/alpha are two different projects.
    // Folding a case-sensitive root merges distinct projects, which is worse than
    // missing a case-only duplicate (mirrors normalizeRuntimePathForComparison).
    expect(selectUnityEditorProcesses([editorRow('/work/Alpha', 111)], '/work/alpha')).toEqual([])
  })

  it('matches Windows argv that spells the same path with forward slashes', () => {
    // Launchers can pass C:/-style paths; a separator mismatch must not start a
    // duplicate editor for the same project.
    const rows = [
      {
        pid: 9,
        command:
          '"C:\\Program Files\\Unity\\Hub\\Editor\\2020.1.0f1\\Editor\\Unity.exe" ' +
          '-projectPath C:/Work/Alpha -useHub'
      }
    ]
    expect(selectUnityEditorProcesses(rows, 'C:\\work\\alpha')).toHaveLength(1)
  })

  it('matches the Windows quoted command line, case-insensitively', () => {
    // B8: the verdict has to hold on all three platforms.
    const rows = [
      {
        pid: 5,
        command:
          '"C:\\Program Files\\Unity\\Hub\\Editor\\2020.1.0f1\\Editor\\Unity.exe" ' +
          '-projectPath "C:\\Work\\Alpha"'
      }
    ]
    expect(selectUnityEditorProcesses(rows, 'C:\\work\\alpha')).toHaveLength(1)
    // POSIX paths are case-sensitive, so the same folding must not happen there.
    expect(
      selectUnityEditorProcesses(
        [{ pid: 6, command: '/opt/unity/Editor/Unity -projectPath /work/Alpha' }],
        '/work/alpha'
      )
    ).toEqual([])
  })
})

describe('findUnityEditorProcess', () => {
  it('swallows an unreadable process table instead of throwing', async () => {
    // B8: a failed `ps`/CIM query must not escape as an exception; "cannot tell"
    // degrades to the pre-existing launch behaviour.
    await expect(
      findUnityEditorProcess({
        projectPath: '/work/alpha',
        platform: 'darwin',
        listProcesses: async () => {
          throw new Error('process table unavailable')
        }
      })
    ).resolves.toBeNull()
  })
})

describe('focusUnityEditorWindow', () => {
  function recorder(...results: FocusCommandResult[]) {
    const calls: { file: string; argv: string[] }[] = []
    let index = 0
    return {
      calls,
      run: async (file: string, argv: readonly string[]): Promise<FocusCommandResult> => {
        calls.push({ file, argv: [...argv] })
        const result = results[Math.min(index, results.length - 1)]!
        index += 1
        return result
      }
    }
  }

  it('targets the pid through System Events on macOS', async () => {
    const spy = recorder({ ok: true, stdout: '' })
    expect(
      await focusUnityEditorWindow({ pid: 4242, platform: 'darwin', runCommand: spy.run })
    ).toEqual({ focused: true })
    expect(spy.calls[0]?.file).toBe('osascript')
    expect(spy.calls[0]?.argv.join(' ')).toContain('unix id is 4242')
  })

  it('asks System Events to prove a window exists, not just set frontmost', async () => {
    // Setting frontmost on a windowless process "succeeds" while raising
    // nothing — the exact false success the pid-popup exists to prevent.
    const spy = recorder({ ok: true, stdout: '' })
    await focusUnityEditorWindow({ pid: 4242, platform: 'darwin', runCommand: spy.run })
    const script = spy.calls[0]?.argv.join(' ') ?? ''
    expect(script).toContain('count of windows')
    expect(script).toContain('orca_no_window')
  })

  it('unminimizes and raises the macOS window instead of only fronting the process', async () => {
    // frontmost alone "succeeds" on a MINIMIZED window while it stays in the
    // Dock; the script must clear AXMinimized and AXRaise before success.
    const spy = recorder({ ok: true, stdout: '' })
    await focusUnityEditorWindow({ pid: 4242, platform: 'darwin', runCommand: spy.run })
    const script = spy.calls[0]?.argv.join(' ') ?? ''
    expect(script).toContain('set value of attribute "AXMinimized" of targetWindow to false')
    expect(script).toContain('perform action "AXRaise" of targetWindow')
    // Ordering: the window-exists proof still runs before anything touches it.
    expect(script.indexOf('orca_no_window')).toBeLessThan(script.indexOf('AXMinimized'))
    expect(script.indexOf('AXMinimized')).toBeLessThan(script.indexOf('frontmost'))
  })

  it('reports no_window when the macOS process owns no window', async () => {
    const spy = recorder({ ok: false, detail: 'execution error: orca_no_window (-2700)' })
    const result = await focusUnityEditorWindow({
      pid: 4242,
      platform: 'darwin',
      runCommand: spy.run
    })
    expect(result.focused === false && result.reason).toBe('no_window')
  })

  it('calls a missing Accessibility grant a permission problem, not a refusal', async () => {
    const spy = recorder({
      ok: false,
      detail: 'osascript is not allowed assistive access. (-25211)'
    })
    const result = await focusUnityEditorWindow({
      pid: 4242,
      platform: 'darwin',
      runCommand: spy.run
    })
    // -25211 is the ACCESSIBILITY (assistive access) denial, not Automation;
    // the copy must send the user to the right System Settings pane.
    expect(result.focused === false && result.reason).toBe('permission_denied_accessibility')
  })

  it('reports the failure instead of raising an arbitrary Unity window', async () => {
    // The plan forbids an `open -a Unity` fallback: with two projects open it
    // fronts the wrong one, which is worse than an honest failure.
    const spy = recorder({ ok: false, detail: 'Not authorized to send Apple events. (-1743)' })
    expect(
      await focusUnityEditorWindow({ pid: 4242, platform: 'darwin', runCommand: spy.run })
    ).toEqual({
      focused: false,
      reason: 'permission_denied_automation',
      detail: 'Not authorized to send Apple events. (-1743)'
    })
    expect(spy.calls.every((call) => call.file === 'osascript')).toBe(true)
  })

  it('does not call a vanished process a permission problem', async () => {
    const spy = recorder({
      ok: false,
      detail: "System Events got an error: Can't get process (-1728)"
    })
    const result = await focusUnityEditorWindow({
      pid: 4242,
      platform: 'darwin',
      runCommand: spy.run
    })
    expect(result.focused === false && result.reason).toBe('no_window')
  })

  it('names the missing tool when xdotool is absent on Linux', async () => {
    const spy = recorder({ ok: false, detail: 'exit 1' })
    const result = await focusUnityEditorWindow({
      pid: 7,
      platform: 'linux',
      runCommand: spy.run,
      env: {},
      commandExists: async () => false
    })
    expect(result).toEqual({
      focused: false,
      reason: 'tool_missing',
      detail: 'xdotool is not installed'
    })
    // The probe is in-process: no `which` (or any other) subprocess runs.
    expect(spy.calls).toEqual([])
  })

  // skipIf: the probe uses posix PATH semantics, unbuildable from a win32 tmpdir.
  const itOnPosix = it.skipIf(process.platform === 'win32')
  itOnPosix('does not misreport installed xdotool as missing when which(1) is absent', async () => {
    // The old probe spawned `which xdotool`; a system without which read every
    // installed xdotool as tool_missing. The PATH is now probed directly.
    const binDir = mkdtempSync(join(tmpdir(), 'orca-xdotool-'))
    roots.push(binDir)
    writeFileSync(join(binDir, 'xdotool'), '#!/bin/sh\n', { mode: 0o755 })
    const calls: string[] = []
    const run = async (file: string): Promise<FocusCommandResult> => {
      calls.push(file)
      if (file === 'which') {
        return { ok: false, detail: 'spawn which ENOENT' }
      }
      return calls.length <= 2 ? { ok: true, stdout: '99\n' } : { ok: true, stdout: '' }
    }

    expect(
      await focusUnityEditorWindow({
        pid: 7,
        platform: 'linux',
        runCommand: run,
        env: { PATH: binDir }
      })
    ).toEqual({ focused: true })
    expect(calls).not.toContain('which')
  })

  it('calls a Wayland session unsupported, not unauthorized', async () => {
    const spy = recorder({ ok: true, stdout: '' })
    const result = await focusUnityEditorWindow({
      pid: 7,
      platform: 'linux',
      runCommand: spy.run,
      env: { WAYLAND_DISPLAY: 'wayland-0' }
    })
    expect(result.focused === false && result.reason).toBe('unsupported_session')
    expect(spy.calls).toEqual([])
  })

  it('separates "no window for this pid" from a refused activation on Linux', async () => {
    const noWindow = recorder({ ok: true, stdout: '   \n' })
    const missing = await focusUnityEditorWindow({
      pid: 7,
      platform: 'linux',
      runCommand: noWindow.run,
      env: {},
      commandExists: async () => true
    })
    expect(missing.focused === false && missing.reason).toBe('no_window')

    const refused = recorder(
      { ok: true, stdout: '12345\n' },
      { ok: false, detail: 'windowactivate failed' }
    )
    const declined = await focusUnityEditorWindow({
      pid: 7,
      platform: 'linux',
      runCommand: refused.run,
      env: {},
      commandExists: async () => true
    })
    expect(declined).toEqual({ focused: false, reason: 'refused', detail: 'windowactivate failed' })
    expect(refused.calls[1]?.argv).toEqual(['search', '--pid', '7', 'windowactivate', '--sync'])
  })

  it('does not call a failed xdotool run "no window"', async () => {
    // A refused X connection proves nothing about windows; "no window" would
    // tell the user the editor is still starting when it may be fully up.
    const noDisplay = recorder({ ok: false, detail: "Error: Can't open display: :0" })
    expect(
      await focusUnityEditorWindow({
        pid: 7,
        platform: 'linux',
        runCommand: noDisplay.run,
        env: {},
        commandExists: async () => true
      })
    ).toEqual({ focused: false, reason: 'refused', detail: "Error: Can't open display: :0" })
  })

  it('maps a spawn-time ENOENT to tool_missing even past the PATH probe', async () => {
    const vanished = recorder({ ok: false, detail: 'spawn xdotool ENOENT' })
    expect(
      await focusUnityEditorWindow({
        pid: 7,
        platform: 'linux',
        runCommand: vanished.run,
        env: {},
        commandExists: async () => true
      })
    ).toEqual({ focused: false, reason: 'tool_missing', detail: 'spawn xdotool ENOENT' })
  })

  it('still reads a silent non-zero xdotool exit as "no window matched"', async () => {
    // xdotool search exits 1 with NO diagnostic when nothing matches the pid.
    const silent = recorder({ ok: false, detail: 'Command failed: xdotool search --pid 7' })
    const result = await focusUnityEditorWindow({
      pid: 7,
      platform: 'linux',
      runCommand: silent.run,
      env: {},
      commandExists: async () => true
    })
    expect(result.focused === false && result.reason).toBe('no_window')
  })

  it('activates the window by pid on Linux once xdotool answers', async () => {
    const spy = recorder({ ok: true, stdout: '99\n' }, { ok: true, stdout: '' })
    expect(
      await focusUnityEditorWindow({
        pid: 7,
        platform: 'linux',
        runCommand: spy.run,
        env: {},
        commandExists: async () => true
      })
    ).toEqual({ focused: true })
  })

  it('drives SetForegroundWindow through PowerShell on Windows', async () => {
    const spy = recorder({ ok: true, stdout: '' })
    expect(
      await focusUnityEditorWindow({ pid: 31, platform: 'win32', runCommand: spy.run })
    ).toEqual({ focused: true })
    expect(spy.calls[0]?.file).toBe('powershell.exe')
    expect(spy.calls[0]?.argv.join(' ')).toContain('SetForegroundWindow')
    expect(spy.calls[0]?.argv.join(' ')).toContain('Get-Process -Id 31')
  })

  it('tells a windowless Windows process apart from a refused foreground change', async () => {
    const noWindow = recorder({ ok: false, detail: 'orca_no_window' })
    expect(
      await focusUnityEditorWindow({ pid: 31, platform: 'win32', runCommand: noWindow.run })
    ).toMatchObject({ focused: false, reason: 'no_window' })

    const refused = recorder({ ok: false, detail: 'orca_refused' })
    expect(
      await focusUnityEditorWindow({ pid: 31, platform: 'win32', runCommand: refused.run })
    ).toMatchObject({ focused: false, reason: 'refused' })
  })
})

describe('openUnityProject with a live editor', () => {
  it('focuses the running editor and launches nothing', async () => {
    // B1 + B5: no second Unity, and a successful focus is silent.
    const worktree = makeUnityProject()
    const launched: string[] = []

    const result = await openUnityProject({
      worktreePath: worktree,
      platform: 'darwin',
      listProcesses: async () => [editorRow(worktree, 5150)],
      runFocusCommand: async () => ({ ok: true, stdout: '' }),
      launch: async (binary) => {
        launched.push(binary)
        return { ok: true }
      }
    })

    expect(result).toEqual({ opened: true, focusedExistingEditor: true })
    expect(launched).toEqual([])
  })

  it('reports focus_failed WITH the pid when the window cannot be raised', async () => {
    // B6: the popup must name the pid, because Orca refuses to guess a window.
    const worktree = makeUnityProject()
    const launched: string[] = []

    const result = await openUnityProject({
      worktreePath: worktree,
      platform: 'darwin',
      listProcesses: async () => [editorRow(worktree, 5150)],
      runFocusCommand: async () => ({ ok: false, detail: 'Not authorized (-1743)' }),
      launch: async (binary) => {
        launched.push(binary)
        return { ok: true }
      }
    })

    expect(result).toEqual({
      opened: false,
      reason: 'focus_failed',
      editorVersion: '2020.1.0f1',
      editorPid: 5150,
      focusFailureReason: 'permission_denied_automation',
      detail: 'Not authorized (-1743)'
    })
    expect(launched).toEqual([])
  })

  it('opens normally when only an AssetImportWorker is alive', async () => {
    // B2: a worker means "Unity is busy here", never "a window is waiting".
    const worktree = makeUnityProject()
    let focusAttempts = 0

    const result = await openUnityProject({
      worktreePath: worktree,
      platform: 'darwin',
      listProcesses: async () => [importWorkerRow(worktree)],
      runFocusCommand: async () => {
        focusAttempts += 1
        return { ok: true, stdout: '' }
      },
      launch: async () => ({ ok: true })
    })

    expect(focusAttempts).toBe(0)
    expect(result.opened === false && result.reason === 'focus_failed').toBe(false)
  })

  it('is not confused by a sibling worktree whose editor is up', async () => {
    // B3, at the caller: the sibling path shares this worktree's prefix.
    const worktree = makeUnityProject()
    let focusAttempts = 0

    const result = await openUnityProject({
      worktreePath: worktree,
      platform: 'darwin',
      listProcesses: async () => [editorRow(`${worktree}-sibling`, 6000)],
      runFocusCommand: async () => {
        focusAttempts += 1
        return { ok: true, stdout: '' }
      },
      launch: async () => ({ ok: true })
    })

    expect(focusAttempts).toBe(0)
    expect(result.opened === false && result.reason === 'focus_failed').toBe(false)
  })

  it('treats a leftover lockfile with no live process as stale', async () => {
    // B4: a crash leaves Temp/UnityLockfile behind; that alone must not focus.
    const worktree = makeUnityProject()
    mkdirSync(join(worktree, 'Temp'), { recursive: true })
    writeFileSync(join(worktree, 'Temp', 'UnityLockfile'), '')
    let focusAttempts = 0

    const result = await openUnityProject({
      worktreePath: worktree,
      platform: 'darwin',
      listProcesses: async () => [],
      runFocusCommand: async () => {
        focusAttempts += 1
        return { ok: true, stdout: '' }
      },
      launch: async () => ({ ok: true })
    })

    expect(focusAttempts).toBe(0)
    expect(result.opened === false && result.reason === 'focus_failed').toBe(false)
  })

  it('shares one in-flight open per project instead of running two', async () => {
    // Two simultaneous opens both passed the editor lookup and double-launched;
    // the second caller must ride the first's promise.
    const worktree = makeUnityProject()
    let probes = 0
    let release!: (rows: UnityProcessRow[]) => void
    const pendingRows = new Promise<UnityProcessRow[]>((resolve) => (release = resolve))
    const args = {
      worktreePath: worktree,
      platform: 'darwin' as const,
      listProcesses: async (): Promise<readonly UnityProcessRow[]> => {
        probes += 1
        return pendingRows
      },
      runFocusCommand: async () => ({ ok: true as const, stdout: '' }),
      launch: async () => ({ ok: true as const })
    }

    const first = openUnityProject(args)
    const second = openUnityProject(args)
    release([editorRow(worktree, 5150)])

    expect(await first).toEqual({ opened: true, focusedExistingEditor: true })
    expect(await second).toEqual({ opened: true, focusedExistingEditor: true })
    expect(probes).toBe(1)
  })

  it('still refuses a non-Unity folder before probing anything', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'orca-unity-focus-'))
    roots.push(empty)
    let probes = 0

    const result = await openUnityProject({
      worktreePath: empty,
      platform: 'darwin',
      listProcesses: async () => {
        probes += 1
        return []
      },
      launch: async () => ({ ok: true })
    })

    expect(result).toEqual({ opened: false, reason: 'not_a_unity_project' })
    expect(probes).toBe(0)
  })
})
