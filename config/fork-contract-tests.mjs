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
  'src/cli/handlers/worktree-default-set.test.ts',
  'src/main/claude/claude-project-transcript-swap.test.ts',
  'src/main/git/default-worktree-switch-ignored-collision.test.ts',
  'src/main/git/default-worktree-switch.test.ts',
  'src/main/ipc/worktree-listing-completeness.test.ts',
  'src/main/runtime/orca-runtime-default-worktree.test.ts',
  'src/main/runtime/rpc/methods/worktree-default-set.test.ts',
  'src/main/unity/unity-firebase-config-timestamps.test.ts',
  'src/main/unity/unity-project-worktree.test.ts',
  'src/main/unity/unity-rider-open.test.ts',
  'src/main/unity/unity-worktree-tint.test.ts',
  'src/renderer/src/components/editor/markdown-limited-html-detection.test.ts',
  'src/renderer/src/components/editor/markdown-preview-sanitize-schemas.test.ts',
  'src/renderer/src/components/sidebar/default-worktree-switch-eligibility.test.ts',
  'src/renderer/src/components/sidebar/default-worktree-switch-live-agents.test.ts',
  'src/renderer/src/components/sidebar/use-default-worktree-switch-dialog.test.tsx',
  'src/renderer/src/components/sidebar/use-worktree-sidebar-unity-tint.test.tsx',
  'src/renderer/src/components/sidebar/worktree-card-unity-tint.test.tsx',
  'src/renderer/src/components/sidebar/worktree-unity-menu.test.tsx',
  'src/renderer/src/hooks/fork-ui-ipc-listeners.test.ts',
  'src/renderer/src/hooks/useIpcEvents-fork-listener-cleanup.test.ts',
  'src/renderer/src/components/sidebar/visible-worktrees-default-checkout.test.ts',
  'src/renderer/src/components/sidebar/worktree-card-compact-agents.summary-name.test.ts',
  'src/renderer/src/components/sidebar/worktree-card-default-switch-entry-points.test.tsx',
  'src/renderer/src/components/sidebar/worktree-card-summary-focus-agent.test.ts',
  'src/renderer/src/components/sidebar/worktree-list/drag/use-default-switch-drop-commit.test.tsx',
  'src/renderer/src/components/sidebar/worktree-list/grouping/section-order.default-checkout.test.ts',
  'src/renderer/src/components/terminal-pane/cold-restore-resume-bookkeeping.test.ts',
  'src/renderer/src/components/terminal-pane/cold-restore-resume-claim.test.ts',
  'src/renderer/src/components/terminal-pane/pty-connection-disposed-resume.test.ts',
  'src/renderer/src/components/terminal-pane/retire-fresh-spawn-keeps-history.test.ts',
  'src/renderer/src/lib/agent-provider-session-single-owner.test.ts',
  'src/renderer/src/lib/default-worktree-switch-agent-notice.test.ts',
  'src/renderer/src/lib/default-worktree-switch-completion-gate.test.ts',
  'src/renderer/src/lib/default-worktree-switch-follow-simulation.test.ts',
  'src/renderer/src/lib/default-worktree-switch-notify-scope.test.ts',
  'src/renderer/src/lib/default-worktree-switch-pane-respawn.test.ts',
  'src/renderer/src/lib/default-worktree-switch-post-wake.test.ts',
  'src/renderer/src/lib/default-worktree-switch-progress.test.ts',
  'src/renderer/src/lib/default-worktree-switch-readiness.test.ts',
  'src/renderer/src/lib/default-worktree-switch-selector-precheck.test.ts',
  'src/renderer/src/lib/default-worktree-switch-shell-pty-release.test.ts',
  'src/renderer/src/lib/default-worktree-switch-sleep-guard.test.ts',
  'src/renderer/src/lib/follow-switch-wake-mount-batches.test.ts',
  'src/renderer/src/store/slices/dead-leaf-pty-bindings.test.ts',
  'src/renderer/src/store/slices/unity-project-repo-probe.test.ts',
  'src/renderer/src/store/slices/unity-tint-sidebar-preview.test.ts',
  'src/renderer/src/store/worktree-identity-grace.test.ts',
  'src/shared/repo-types.test.ts',
  'src/shared/unity-worktree-tint-palette.test.ts',
  'src/shared/worktree-branch-web-url.test.ts'
]

/** Upstream test files carrying fork-added cases or fork-adjusted expectations. */
export const FORK_CARRYING_TESTS = [
  'src/renderer/src/components/dashboard-popout/AgentMapWorkspaceContextMenu.test.tsx',
  'src/main/codex/codex-trust-grant-host.test.ts',
  'src/main/ipc/register-core-handlers.test.ts',
  'src/main/local-worktree-filesystem-wsl-banner.wsl.test.ts',
  'src/main/local-worktree-filesystem.test.ts',
  'src/main/persistence-cohort-and-identity-migration.test.ts',
  'src/main/providers/local-pty-provider-windows-shell-launch.test.ts',
  'src/main/window/attach-main-window-services.test.ts',
  'src/renderer/src/components/WorktreeJumpPalette.test.tsx',
  'src/renderer/src/components/settings/CliSkillRuntimeSetup.test.tsx',
  'src/renderer/src/components/sidebar/WorktreeCard.quick-actions.test.tsx',
  'src/renderer/src/components/sidebar/WorktreeContextMenu.test.ts',
  'src/renderer/src/components/sidebar/default-branch-visible-under-hide-sleeping.test.ts',
  'src/renderer/src/components/sidebar/rendered-sidebar-worktree-order.test.ts',
  'src/renderer/src/components/sidebar/sidebar-filter-state.test.ts',
  'src/renderer/src/components/sidebar/visible-worktrees.test.ts',
  'src/renderer/src/components/sidebar/worktree-sidebar-drop-preview.test.ts',
  'src/renderer/src/components/sidebar/worktree-title-derived-agent-rows.test.ts',
  'src/renderer/src/components/terminal-pane/terminal-parked-tab-watchers.test.ts',
  'src/renderer/src/components/terminal-pane/terminal-shutdown-layout-capture.test.ts',
  'src/renderer/src/components/worktree-jump-palette-sleeping-filter.test.ts',
  'src/renderer/src/hooks/worktree-change-refresh-queue.test.ts',
  'src/renderer/src/store/slices/store-sleep-pane-hibernation.test.ts',
  'src/renderer/src/store/slices/store-sleep-runtime-convergence.test.ts',
  'src/shared/cross-platform-path.test.ts',
  'src/shared/git-binary-compatibility.test.ts',
  'src/shared/wsl-exec-mode-separator.test.ts'
]

export const FORK_CONTRACT_TESTS = [...FORK_ADDED_TESTS, ...FORK_CARRYING_TESTS]
