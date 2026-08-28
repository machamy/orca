import { execFile } from 'node:child_process'
import { isCommandOnLocalPath } from '../ipc/command-path-resolver'
import { findUnityEditorProcess, type UnityProcessRow } from './unity-editor-process-lookup'
import type { UnityOpenResult } from '../../shared/unity-worktree'

/**
 * Raise an already-running Unity editor's window, by pid.
 *
 * The mechanics are the ones the bundled computer-use runtimes already prove:
 * `ShowWindow(SW_RESTORE)` + `SetForegroundWindow` (native/computer-use-windows
 * runtime.ps1 `Restore-OrcaWindow`) and `xdotool search --pid N windowactivate
 * --sync` (native/computer-use-linux runtime.py `restore_window`). Those live
 * behind the computer-use permission gate and are not callable from main, so
 * the technique is reused rather than the code. macOS is the exception: its
 * runtime drives the Accessibility APIs, which Node cannot, so this uses
 * `osascript` + System Events — the shape `simulator-app-visibility.ts` already
 * uses to HIDE the simulator.
 *
 * There is deliberately NO `open -a Unity` fallback: with two projects open it
 * raises an arbitrary window, and pointing the user at the wrong editor is
 * worse than telling them the truth. Every failure reports a CAUSE, because
 * "permission denied" is only one of several and the UI must not overclaim.
 */
export type UnityEditorFocusFailureReason =
  /** macOS Automation (Apple Events) not granted. */
  | 'permission_denied_automation'
  /** macOS Accessibility (assistive access) not granted — window enumeration needs it. */
  | 'permission_denied_accessibility'
  /** The editor is alive but owns no window yet (or already exited). */
  | 'no_window'
  /** The platform helper is not installed (Linux xdotool). */
  | 'tool_missing'
  /** Wayland, or a platform with no supported way to raise a window. */
  | 'unsupported_session'
  /** The window manager or OS declined the foreground change. */
  | 'refused'

export type UnityEditorFocusResult =
  | { focused: true }
  | { focused: false; reason: UnityEditorFocusFailureReason; detail: string }

export type FocusCommandResult = { ok: true; stdout: string } | { ok: false; detail: string }

export type FocusCommandRunner = (
  file: string,
  argv: readonly string[]
) => Promise<FocusCommandResult>

const FOCUS_COMMAND_TIMEOUT_MS = 5_000
// Why: execFile's own timeout only sends SIGTERM; a child that ignores it would
// leave the callback — and the user's click — pending forever.
const FOCUS_COMMAND_HARD_SETTLE_MS = 8_000

// Frontmost-by-unix-id, so the right editor rises when several are open. Needs
// the macOS Automation grant; the first attempt is what makes macOS ask.
// The window count runs first: setting frontmost on a windowless process
// "succeeds" while raising nothing, hiding the failure the pid-popup reports.
// Frontmost alone leaves a MINIMIZED window in the Dock, so AXMinimized is
// cleared and the window AXRaised first; both are try-wrapped because an odd
// window without those attributes must not fail a focus that frontmost handles.
function macosFocusScript(pid: number): string {
  return [
    'tell application "System Events"',
    `set targetProcess to first application process whose unix id is ${pid}`,
    'if (count of windows of targetProcess) is 0 then error "orca_no_window"',
    'set targetWindow to window 1 of targetProcess',
    'try',
    'if value of attribute "AXMinimized" of targetWindow is true then',
    'set value of attribute "AXMinimized" of targetWindow to false',
    'end if',
    'end try',
    'set frontmost of targetProcess to true',
    'try',
    'perform action "AXRaise" of targetWindow',
    'end try',
    'end tell'
  ].join('\n')
}

// Mirrors Restore-OrcaWindow; SW_RESTORE (9) first, because a minimized window
// cannot take the foreground. The two failures are reported apart on purpose.
function windowsFocusScript(pid: number): string {
  return [
    '$ErrorActionPreference = "Stop";',
    `$target = Get-Process -Id ${pid};`,
    '$handle = $target.MainWindowHandle;',
    'if ($handle -eq [IntPtr]::Zero) { Write-Error "orca_no_window" };',
    "Add-Type -Namespace OrcaUnity -Name Window -MemberDefinition '",
    '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);',
    '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);',
    "';",
    '[void][OrcaUnity.Window]::ShowWindow($handle, 9);',
    'if (-not [OrcaUnity.Window]::SetForegroundWindow($handle)) { Write-Error "orca_refused" }'
  ].join(' ')
}

function defaultRunCommand(file: string, argv: readonly string[]): Promise<FocusCommandResult> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (result: FocusCommandResult): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(hardSettle)
      resolve(result)
    }
    const hardSettle = setTimeout(() => {
      child.kill()
      settle({ ok: false, detail: `${file} did not answer in time` })
    }, FOCUS_COMMAND_HARD_SETTLE_MS)
    if (typeof hardSettle.unref === 'function') {
      hardSettle.unref()
    }
    const child = execFile(
      file,
      [...argv],
      {
        timeout: FOCUS_COMMAND_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        // Why: Electron's main has no console, so an unhidden PowerShell fork
        // pops a conhost window that flashes and steals keyboard focus — the
        // exact thing this module is trying to give to Unity.
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          settle({ ok: false, detail: (stderr || error.message).trim() })
          return
        }
        settle({ ok: true, stdout: stdout.toString() })
      }
    )
  })
}

/**
 * -1743 is errAEEventNotPermitted; -25211 is the Accessibility (assistive
 * access) denial that window enumeration needs; -1728 means the process is
 * already gone; orca_no_window is this module's own windowless verdict.
 */
function macosFailureReason(detail: string): UnityEditorFocusFailureReason {
  // Split on purpose: -25211 is fixed in the ACCESSIBILITY pane, -1743 in
  // Automation, and pointing at the wrong pane leaves the user stuck.
  if (detail.includes('-25211') || /assistive access/i.test(detail)) {
    return 'permission_denied_accessibility'
  }
  if (detail.includes('-1743') || /not authoriz/i.test(detail)) {
    return 'permission_denied_automation'
  }
  if (
    detail.includes('orca_no_window') ||
    detail.includes('-1728') ||
    /can[’']?t get/i.test(detail)
  ) {
    return 'no_window'
  }
  return 'refused'
}

function windowsFailureReason(detail: string): UnityEditorFocusFailureReason {
  if (detail.includes('orca_no_window') || /Cannot find a process/i.test(detail)) {
    return 'no_window'
  }
  return 'refused'
}

async function focusOnLinux(
  pid: number,
  run: FocusCommandRunner,
  env: NodeJS.ProcessEnv,
  commandExists: (command: string) => Promise<boolean>
): Promise<UnityEditorFocusResult> {
  // xdotool drives X11 only; under Wayland it silently addresses nothing.
  if (env.WAYLAND_DISPLAY || env.XDG_SESSION_TYPE === 'wayland') {
    return {
      focused: false,
      reason: 'unsupported_session',
      detail: 'raising another app’s window needs X11; this session is Wayland'
    }
  }
  // Matches restore_window's shutil.which guard: absence is a distinct outcome
  // from a window manager that declined. PATH is probed in-process — a system
  // without which(1) must not misreport an installed xdotool as missing.
  if (!(await commandExists('xdotool'))) {
    return { focused: false, reason: 'tool_missing', detail: 'xdotool is not installed' }
  }
  const search = await run('xdotool', ['search', '--pid', String(pid)])
  if (!search.ok) {
    // xdotool search exits non-zero BOTH when nothing matched (silently) and
    // when it could not run at all; only a silent exit is a no-window verdict.
    const diagnostic = search.detail.replace(/^Command failed:.*$/m, '').trim()
    if (diagnostic !== '') {
      return /ENOENT/.test(diagnostic)
        ? { focused: false, reason: 'tool_missing', detail: search.detail }
        : { focused: false, reason: 'refused', detail: search.detail }
    }
  }
  if (!search.ok || search.stdout.trim() === '') {
    return {
      focused: false,
      reason: 'no_window',
      detail: 'xdotool found no window belonging to that process'
    }
  }
  const activate = await run('xdotool', [
    'search',
    '--pid',
    String(pid),
    'windowactivate',
    '--sync'
  ])
  return activate.ok
    ? { focused: true }
    : { focused: false, reason: 'refused', detail: activate.detail }
}

export async function focusUnityEditorWindow(args: {
  pid: number
  platform?: NodeJS.Platform
  /** Test seams: nothing here may spawn or read the real environment in tests. */
  runCommand?: FocusCommandRunner
  env?: NodeJS.ProcessEnv
  commandExists?: (command: string) => Promise<boolean>
}): Promise<UnityEditorFocusResult> {
  const platform = args.platform ?? process.platform
  const run = args.runCommand ?? defaultRunCommand

  if (platform === 'darwin') {
    const result = await run('osascript', ['-e', macosFocusScript(args.pid)])
    return result.ok
      ? { focused: true }
      : { focused: false, reason: macosFailureReason(result.detail), detail: result.detail }
  }

  if (platform === 'win32') {
    const result = await run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      windowsFocusScript(args.pid)
    ])
    return result.ok
      ? { focused: true }
      : { focused: false, reason: windowsFailureReason(result.detail), detail: result.detail }
  }

  if (platform === 'linux') {
    const env = args.env ?? process.env
    const commandExists =
      args.commandExists ??
      ((command: string) => isCommandOnLocalPath(command, { platform: 'linux', env }))
    return focusOnLinux(args.pid, run, env, commandExists)
  }

  return {
    focused: false,
    reason: 'unsupported_session',
    detail: `raising a window is unsupported on ${platform}`
  }
}

/**
 * The open outcome when an editor already holds this project: raise its window,
 * or report the failure with its cause and the pid, so the UI can name the
 * window it means without guessing why it could not reach it.
 *
 * Returns null when no editor is running — the caller then launches as usual.
 *
 * Known window: Unity takes seconds to create its window, so a second open
 * pressed during that ramp-up finds the process but no window, and reports
 * `no_window` rather than launching a duplicate. That is the intended trade —
 * `launchDetachedEditor` does not surface the child's pid, so there is nothing
 * better to focus, and a duplicate editor on one project is the harm this
 * whole path exists to prevent.
 */
export async function openExistingUnityEditorWindow(args: {
  worktreePath: string
  editorVersion: string
  platform: NodeJS.Platform
  listProcesses?: () => Promise<readonly UnityProcessRow[]>
  runFocusCommand?: FocusCommandRunner
}): Promise<UnityOpenResult | null> {
  const editor = await findUnityEditorProcess({
    projectPath: args.worktreePath,
    platform: args.platform,
    ...(args.listProcesses ? { listProcesses: args.listProcesses } : {})
  })
  if (!editor) {
    return null
  }
  const focus = await focusUnityEditorWindow({
    pid: editor.pid,
    platform: args.platform,
    ...(args.runFocusCommand ? { runCommand: args.runFocusCommand } : {})
  })
  if (focus.focused) {
    return { opened: true, focusedExistingEditor: true }
  }
  return {
    opened: false,
    reason: 'focus_failed',
    editorVersion: args.editorVersion,
    editorPid: editor.pid,
    focusFailureReason: focus.reason,
    detail: focus.detail
  }
}
