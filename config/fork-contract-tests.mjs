/**
 * The fork's regression contract — the single source of truth for which test
 * files pin the fork's behavior AND the upstream behavior we re-touched.
 *
 * Two consumers read this list:
 *  - `config/vitest.fork.config.ts` runs exactly these files (`pnpm test:fork`),
 *    the fast post-merge gate before the full suite.
 *  - `src/shared/fork-contract-manifest.test.ts` asserts every entry still
 *    exists, so a merge that deletes or renames one fails loudly instead of
 *    silently shrinking the contract.
 *
 * When a fork feature gains a test, add it here. When upstream folds one of
 * these files away during a merge, the failing manifest test is the reminder
 * to re-transplant its fork cases before removing the entry.
 */

/** Test files that exist only in the fork. */
export const FORK_ADDED_TESTS = [
  'src/main/claude-accounts/claude-api-key-account.fork.test.ts',
  'src/main/claude-accounts/profiles/routing/claude-profile-router-api-key.fork.test.ts',
  'src/renderer/src/components/editor/markdown-preview-reading-layout.test.ts',
  'src/renderer/src/components/editor/MarkdownPreviewBody.github.test.tsx',
  'src/renderer/src/components/editor/markdown-preview-table-widths-storage.test.ts',
  'src/renderer/src/components/editor/use-markdown-preview-table-column-resize.test.tsx',
  'src/main/claude/hooks/statusline-model-badge-wrapper.test.ts',
  'src/renderer/src/components/terminal-pane/agent-model-badge/agent-model-badge-statusline-feed.test.ts',
  'src/main/ipc/worktree-listing-completeness.test.ts',
  'src/main/persistence/persistence-worktree-folder-membership-migration.test.ts',
  'src/main/persistence/tracking-repos/repo-hydration.test.ts',
  'src/main/unity/unity-editor-focus.test.ts',
  'src/main/unity/unity-firebase-config-timestamps.test.ts',
  'src/main/unity/unity-project-worktree.test.ts',
  'src/main/unity/unity-rider-open.test.ts',
  'src/main/unity/unity-worktree-tint.test.ts',
  'src/renderer/src/components/browser-pane/navigate/guest-navigation-probe-invalidation.test.ts',
  'src/renderer/src/components/browser-pane/navigate/load-browser-guest-url.test.ts',
  'src/renderer/src/components/browser-pane/navigate/navigate-browser-page-url.test.ts',
  'src/renderer/src/components/browser-pane/navigate/retry-browser-page-load.test.ts',
  'src/renderer/src/components/editor/rich-markdown/details/details-markdown-html.fork.test.ts',
  'src/renderer/src/components/editor/markdown/render-mode/markdown-rich-mode.fork.test.ts',
  'config/scripts/local-git-exclude-packaging.test.mjs',
  'config/scripts/desktop-distribution/macos/build-mac-local.fork.test.mjs',
  'src/main/browser/guest-lifecycle/input/shortcuts/browser-guest-shortcut-forwarding.fork.test.ts',
  'src/renderer/src/components/editor/view-mode/markdown-preview-controls.test.ts',
  'src/renderer/src/components/browser-pane/describe-page/browser-page-url-display.fork.test.ts',
  'src/renderer/src/components/right-sidebar/source-control/listing/file-filter.test.ts',
  'src/renderer/src/components/right-sidebar/source-control/panel/SourceControlFilterPreset.test.tsx',
  'src/main/runtime/runtime-local-worktree-unity-seed.test.ts',
  'src/main/updater/updater.fork-official-checks-gate.test.ts',
  'src/main/updater/updater.fork-internal-feed.test.ts',
  'src/main/native-chat/agent-session-wire/structured-agent-session-shell-command-ride-along.test.ts',
  'src/main/startup/inherited-pane-env.test.ts',
  'src/shared/agent-hook-listener-claude-model-effort.test.ts',
  'src/shared/agent-hook-listener/providers/claude-model-effort-fields.test.ts',
  'src/shared/agent-model-badge-settings.test.ts',
  'src/renderer/src/components/terminal-pane/agent-model-badge/agent-model-badge-reading.test.ts',
  'src/renderer/src/components/terminal-pane/agent-model-badge/AgentModelBadge.test.tsx',
  'src/renderer/src/components/editor/rich-markdown/details/rich-markdown-details-keyboard.test.ts',
  'src/renderer/src/components/editor/markdown-limited-html-detection.test.ts',
  'src/renderer/src/components/editor/markdown-preview-sanitize-schemas.test.ts',
  'src/renderer/src/components/editor/markdown/render-mode/markdown-round-trip.test.ts',
  'src/renderer/src/components/sidebar/WorktreeFolderDeleteDialog.test.ts',
  'src/renderer/src/components/sidebar/WorktreeFolderRowMenu.test.ts',
  'src/renderer/src/components/sidebar/use-worktree-sidebar-unity-tint.test.tsx',
  'src/renderer/src/components/sidebar/WorktreeFolderRowMenu.context-menu.test.tsx',
  'src/renderer/src/components/sidebar/worktree-folder-conversion.test.ts',
  'src/renderer/src/components/sidebar/worktree-folder-menu.test.tsx',
  'src/renderer/src/components/sidebar/worktree-card-unity-tint.test.tsx',
  'src/renderer/src/components/sidebar/worktree-unity-menu.test.tsx',
  'src/renderer/src/components/sidebar/worktree-unity-tint-menu.test.tsx',
  'src/renderer/src/app-shell/unity-editor-shortcuts.test.tsx',
  'src/renderer/src/hooks/fork-ui-ipc-listeners.test.ts',
  'src/renderer/src/hooks/useIpcEvents-fork-listener-cleanup.test.ts',
  'src/renderer/src/components/sidebar/visible-worktrees-default-checkout.test.ts',
  'src/renderer/src/components/sidebar/worktree-card-compact-agents.summary-name.test.ts',
  'src/renderer/src/components/sidebar/worktree-card-summary-focus-agent.test.ts',
  'src/renderer/src/components/sidebar/worktree-list/navigation/worktree-folder-reveal.test.ts',
  'src/renderer/src/components/sidebar/worktree-list/viewport/worktree-folder-row-estimate.test.ts',
  'src/shared/sidebar-list/section-order.default-checkout.test.ts',
  'src/renderer/src/components/sidebar/worktree-list/rows/worktree-folder-indentation.test.ts',
  'src/renderer/src/components/sidebar/worktree-list/listing/use-collapsed-groups.test.tsx',
  'src/renderer/src/components/sidebar/worktree-list/grouping/worktree-folder-rows.test.ts',
  'src/renderer/src/components/sidebar/worktree-list/rows/worktree-folder-row.test.tsx',
  'src/renderer/src/components/terminal-pane/cold-restore-resume-bookkeeping.test.ts',
  'src/renderer/src/components/terminal-pane/cold-restore-resume-claim.test.ts',
  'src/renderer/src/components/terminal-pane/pty-connection/lifecycle/pty-connection-cold-restore-claim.fork.test.ts',
  'src/renderer/src/lib/agent-provider-session-single-owner.test.ts',
  'src/renderer/src/store/slices/worktree-folders.test.ts',
  'src/renderer/src/store/slices/unity-project-repo-probe.test.ts',
  'src/renderer/src/store/slices/unity-tint-sidebar-preview.test.ts',
  'src/shared/fork-contract-manifest.test.ts',
  'src/shared/repo-types.test.ts',
  'src/shared/unity-worktree-tint-palette.test.ts',
  'src/shared/worktree-branch-web-url.test.ts',
  'src/shared/worktree-folder/resolve.test.ts',
  'src/shared/constants.fork.test.ts',
  'src/renderer/src/runtime/rpc/targets/runtime-worktree-selector.fork.test.ts',
  'src/shared/git/compatibility/git-worktree-binary-compatibility.fork.test.ts',
  'src/renderer/src/components/sidebar/workspace-actions/context-menu/worktree-context-menu-policy.fork.test.ts',
  'src/shared/worktree/workspace-kinds.fork.test.ts',
  'src/renderer/src/components/sidebar/worktree-list/rows/repo-header-project-actions.test.tsx'
]

/** Upstream test files carrying fork-added cases or fork-adjusted expectations. */
export const FORK_CARRYING_TESTS = [
  'src/main/browser/browser-guest-context-menu.test.ts',
  'src/main/claude/hooks/claude-status-line-install.test.ts',
  'src/main/workspaces/removal/local-worktree-filesystem-wsl-banner.wsl.test.ts',
  'src/main/workspaces/removal/local-worktree-filesystem.test.ts',
  'src/main/persistence/persistence-cohort-and-identity-migration.test.ts',
  'src/main/updater/lifecycle/main-window-updater.fork-official-checks.test.ts',
  'src/renderer/src/components/settings/advanced/ExperimentalPane.test.tsx',
  'src/renderer/src/components/worktree-jump-palette-sleeping-filter.test.ts',
  'src/renderer/src/store/terminals/sleep/store-sleep-pane-hibernation.test.ts',
  'src/shared/file-access/cross-platform-path.test.ts'
]

export const FORK_CONTRACT_TESTS = [...FORK_ADDED_TESTS, ...FORK_CARRYING_TESTS]
