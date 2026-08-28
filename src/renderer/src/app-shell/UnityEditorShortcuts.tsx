import React, { useCallback, useEffect, useMemo } from 'react'
import { isEditableTarget } from '../lib/editable-target'
import { getShortcutPlatform } from '../lib/shortcut-platform'
import {
  selectUnityTintSiblingWorktrees,
  unityTintSiblingLabelsOf
} from '../components/sidebar/unity-tint-sibling-worktrees'
import { getDeleteStateForWorktreeHost } from '../components/sidebar/worktree-delete-state-host-match'
import { useUnityWorktreeOpenActions } from '../components/sidebar/unity-worktree-open-actions'
import { findPluginCommandForKeybinding } from '../lib/plugin-command-keybindings'
import { usePluginCommands } from '../store/plugin-panels'
import { useActiveWorktree, useAllWorktrees, useRepoById } from '../store/selectors'
import { useAppStore } from '../store'
import { isLocallyRunnableUnityWorkspace } from '../../../shared/unity-repo-eligibility'
import { isDefaultCheckoutWorkspace } from '../../../shared/worktree/ownership'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'
import { getKeybindingContext } from './app-command-handlers'
import { matchUnityEditorShortcut, type UnityEditorShortcut } from './unity-editor-shortcut-match'

/**
 * Fork: "Open in Unity" / "Open in Rider" from the keyboard.
 *
 * Its own listener rather than an entry in `createAppCommandHandlers`, for the
 * same reason `useMarkdownPreviewShortcut` has one: the action is asynchronous
 * (it probes the project first) and owns a dialog, and that map's handlers are
 * synchronous predicates returning whether they claimed the chord.
 *
 * Target is the ACTIVE worktree — every other shortcut uses it, and the
 * sidebar's multi-selection is React-local state the store never sees.
 */
export function UnityEditorShortcuts(): React.JSX.Element | null {
  const worktree = useActiveWorktree()
  const repo = useRepoById(worktree?.repoId ?? null)
  if (!worktree || !repo || !isLocallyRunnableUnityWorkspace(worktree, repo)) {
    return null
  }
  // Keyed so a worktree switch cannot leave the previous target's confirm
  // dialog open over the new one.
  return <ActiveWorktreeUnityShortcuts key={worktree.id} worktree={worktree} repo={repo} />
}

function ActiveWorktreeUnityShortcuts(props: {
  worktree: Worktree
  repo: Repo
}): React.JSX.Element {
  const { worktree, repo } = props
  const allWorktrees = useAllWorktrees()
  const pluginCommands = usePluginCommands()
  const keybindings = useAppStore((store) => store.keybindings)
  const terminalShortcutPolicy = useAppStore((store) => store.settings?.terminalShortcutPolicy)
  const markUnityProjectRepoDetected = useAppStore((store) => store.markUnityProjectRepoDetected)
  // Same gate as the menu's disabled Unity entries: no launch on a vanishing checkout.
  const isDeleting = useAppStore((store) =>
    Boolean(getDeleteStateForWorktreeHost(worktree, store.deleteStateByWorktreeId)?.isDeleting)
  )
  const isDefaultWorktreePath = isDefaultCheckoutWorkspace(worktree, repo)
  const repoPath = repo.path
  const unityTintSiblingLabels = useMemo(
    () =>
      unityTintSiblingLabelsOf(
        selectUnityTintSiblingWorktrees(allWorktrees, worktree.repoId, repoPath)
      ),
    [allWorktrees, repoPath, worktree.repoId]
  )
  const actions = useUnityWorktreeOpenActions({
    worktree,
    repo,
    isDefaultWorktreePath,
    unityTintSiblingLabels
  })
  const { requestUnityOpen, handleRiderOpen } = actions
  const worktreePath = worktree.path
  const repoId = repo.id

  const runShortcut = useCallback(
    async (shortcut: UnityEditorShortcut): Promise<void> => {
      if (isDeleting) {
        return
      }
      // The menu's probe only runs while the menu is open, so the shortcut has
      // to run its own — without it the cache-copy question would be skipped
      // and the two surfaces would behave differently (C6).
      const status = await window.api.unity
        .worktreeStatus({ worktreePath, sourcePath: repoPath })
        .catch(() => null)
      // Re-checked after the await: a delete may have started while the probe ran.
      const deletingNow = Boolean(
        getDeleteStateForWorktreeHost(worktree, useAppStore.getState().deleteStateByWorktreeId)
          ?.isDeleting
      )
      if (deletingNow) {
        return
      }
      if (!status?.isUnityProject) {
        // Same as the menu, which simply has no Unity entries to show.
        return
      }
      markUnityProjectRepoDetected?.(repoId, repoPath)
      if (shortcut === 'unity') {
        requestUnityOpen(status)
        return
      }
      // The menu hides "Open in Rider" when Rider is missing; do nothing here too.
      if (status.riderInstalled) {
        void handleRiderOpen()
      }
    },
    [
      isDeleting,
      worktree,
      worktreePath,
      repoPath,
      repoId,
      markUnityProjectRepoDetected,
      requestUnityOpen,
      handleRiderOpen
    ]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat) {
        return
      }
      // Ctrl+Alt IS AltGr on Windows/Linux, so a chord typed into a text field
      // must stay text.
      if (isEditableTarget(event.target)) {
        return
      }
      // The Settings recorder captures existing chords; same guard as use-global-keybindings.
      if (
        event.target instanceof Element &&
        event.target.closest('[data-shortcut-recorder-active]') !== null
      ) {
        return
      }
      const context = getKeybindingContext(event.target)
      const shortcut = matchUnityEditorShortcut(event, getShortcutPlatform(), keybindings, {
        context,
        terminalShortcutPolicy
      })
      if (!shortcut) {
        return
      }
      // Plugin chords outrank built-ins in app focus (use-global-keybindings
      // order). This listener can register first (child effects run before
      // App's), so it must yield a plugin-claimed chord, not race for it.
      if (
        context === 'app' &&
        findPluginCommandForKeybinding(
          pluginCommands,
          event,
          getShortcutPlatform(),
          keybindings,
          true
        )
      ) {
        return
      }
      event.preventDefault()
      void runShortcut(shortcut)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [keybindings, pluginCommands, terminalShortcutPolicy, runShortcut])

  return <>{actions.confirmDialog}</>
}
