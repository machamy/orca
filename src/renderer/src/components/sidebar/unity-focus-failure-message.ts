import { translate } from '@/i18n/i18n'
import type { UnityOpenResult } from '../../../../shared/unity-worktree'

type FocusFailureReason = Extract<UnityOpenResult, { opened: false }>['focusFailureReason']

/**
 * Copy for "the editor is already open but its window would not come forward".
 *
 * The pid is in every variant that HAS one, because Orca deliberately refuses
 * to raise an arbitrary Unity window — the user has to find this exact one. The
 * cause is NOT flattened to "permission denied": a missing xdotool, a Wayland
 * session, a window that does not exist yet and an OS that declined the
 * foreground change are four different problems with four different fixes.
 * One variant has no pid to claim: the recent-launch guard fires before the
 * editor it spawned reaches the process table.
 */
export function unityFocusFailureMessage(
  pid: number | undefined,
  reason: FocusFailureReason,
  detail: string | undefined
): string {
  if (pid === undefined && reason === 'no_window') {
    return translate(
      'auto.components.sidebar.WorktreeContextMenu.unityFocusStillStarting',
      'Unity is still starting up for this project — try again in a moment.'
    )
  }
  const values = { pid: String(pid ?? '?'), detail: detail ?? '' }
  if (reason === 'permission_denied_automation') {
    return translate(
      'auto.components.sidebar.WorktreeContextMenu.unityFocusDenied',
      'This project is already open in Unity (pid {{pid}}). Orca could not bring that window forward because macOS has not granted it Automation access — allow it under Privacy & Security → Automation.',
      values
    )
  }
  // -25211: window enumeration needs assistive access, a DIFFERENT pane than
  // Automation — the copy must send the user to the one that actually fixes it.
  if (reason === 'permission_denied_accessibility') {
    return translate(
      'auto.components.sidebar.WorktreeContextMenu.unityFocusDeniedAccessibility',
      'This project is already open in Unity (pid {{pid}}). Orca could not bring that window forward because macOS has not granted it Accessibility access — allow it under Privacy & Security → Accessibility.',
      values
    )
  }
  if (reason === 'no_window') {
    return translate(
      'auto.components.sidebar.WorktreeContextMenu.unityFocusNoWindow',
      'This project is already open in Unity (pid {{pid}}), but that process has no window yet — it may still be starting up.',
      values
    )
  }
  if (reason === 'tool_missing') {
    return translate(
      'auto.components.sidebar.WorktreeContextMenu.unityFocusToolMissing',
      'This project is already open in Unity (pid {{pid}}). Bringing another app’s window forward on Linux needs xdotool, which is not installed.',
      values
    )
  }
  if (reason === 'unsupported_session') {
    return translate(
      'auto.components.sidebar.WorktreeContextMenu.unityFocusUnsupported',
      'This project is already open in Unity (pid {{pid}}), but this desktop session offers no way to raise another app’s window: {{detail}}',
      values
    )
  }
  return translate(
    'auto.components.sidebar.WorktreeContextMenu.unityFocusRefused',
    'This project is already open in Unity (pid {{pid}}), but the system declined to bring its window forward: {{detail}}',
    values
  )
}
