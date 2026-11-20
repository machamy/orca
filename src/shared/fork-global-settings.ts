import type { AgentModelBadgeSettings } from './agent-model-badge-settings'

/** Fork-only settings, kept apart so global-settings-types.ts tracks upstream line for line. */
export type ForkGlobalSettings = {
  /** Fork: embedded-browser markdown file URLs hand off to the editor (machamy.8). Off restores
   *  upstream's raw rendering for markdown only — notebooks predate the generalization and always hand off. */
  browserMarkdownEditorHandoff?: boolean
  /** Fork, experimental: sidebar worktree folders. Gates rendering/entry points only —
   *  never the persisted folder records or membership, so off→on round-trips losslessly. */
  experimentalWorktreeFolders?: boolean
  /** Fork: pane-corner badge naming the agent's current model and reasoning effort.
   *  Absent means the default (on, bottom-right) — see resolveAgentModelBadgeSettings. */
  agentModelBadge?: AgentModelBadgeSettings
  /** Fork: the view a markdown file opens in. Absent means 'preview' — the rendered,
   *  GitHub-style read view — since the rich editor refuses whole classes of docs. */
  markdownDefaultViewMode?: 'preview' | 'rich' | 'source'
  /** Fork: automatic checks for official Orca releases. Absent means off — a fork build reads as
   *  older than the same upstream release, so the official build was offered over it. */
  officialUpdateChecks?: boolean
}
