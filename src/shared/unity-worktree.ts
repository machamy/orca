/** Wire types for the per-worktree Unity actions (fork feature): shared between
 *  the main-process implementation and the renderer-facing preload surface. */
export type UnityWorktreeStatus = {
  isUnityProject: boolean
  editorVersion: string | null
  /** Whether that exact editor version is installed locally. */
  editorInstalled: boolean
  /** Non-empty `Library` at the worktree — the "already seeded" signal. */
  worktreeHasLibrary: boolean
  /** Non-empty `Library` at the seed source (the repo default checkout). */
  sourceHasLibrary: boolean
  /** Whether JetBrains Rider is installed (macOS; gates "Open in Rider"). */
  riderInstalled: boolean
}

export type UnityRiderOpenResult =
  | {
      opened: true
      /** 'folder' = no .sln existed anywhere yet; Rider got the bare folder. */
      target: 'solution' | 'folder'
    }
  | {
      opened: false
      reason: 'not_a_unity_project' | 'rider_missing' | 'launch_failed'
      detail?: string
    }

export type UnitySeedResult =
  | { seeded: true }
  | {
      seeded: false
      reason:
        | 'already_seeded'
        | 'source_missing'
        | 'source_editor_running'
        | 'target_editor_running'
        | 'seed_in_progress'
        | 'worktree_missing'
        | 'cow_unsupported'
        | 'clone_failed'
      detail?: string
    }

export type UnityOpenResult =
  | {
      opened: true
      /** True when nothing was launched — an existing editor window was raised. */
      focusedExistingEditor?: boolean
    }
  | {
      opened: false
      reason:
        | 'not_a_unity_project'
        | 'editor_missing'
        | 'launch_failed'
        | 'seed_in_progress'
        /** An editor already holds the project but its window could not be
         *  raised; the UI must name `editorPid` so the user can find it. */
        | 'focus_failed'
      editorVersion?: string
      /** Whether Unity Hub was actually opened as the fallback — the UI must
       *  not claim it was when it was not. */
      hubOpened?: boolean
      /** Set with `focus_failed`: the pid of the editor already holding it. */
      editorPid?: number
      /** Set with `focus_failed`: WHY the window did not come forward. The UI
       *  must not report a missing tool or a refused foreground change as a
       *  permission problem. */
      focusFailureReason?:
        | 'permission_denied_automation'
        | 'permission_denied_accessibility'
        | 'no_window'
        | 'tool_missing'
        | 'unsupported_session'
        | 'refused'
      detail?: string
    }

/** Result of re-writing a worktree's tint script after a colour choice, with no
 *  editor launch. `applied` is false only when the folder is not a Unity
 *  project at all — a `skipped` outcome (git would track the script) still
 *  counts as handled. */
export type UnityTintApplyResult = {
  applied: boolean
  outcome: 'written' | 'removed' | 'unchanged' | 'skipped' | 'not_a_unity_project'
}
