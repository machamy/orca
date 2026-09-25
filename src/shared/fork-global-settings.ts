import type { AgentModelBadgeSettings } from './agent-model-badge-settings'

/** Fork-only settings, kept apart so global-settings-types.ts tracks upstream line for line. */
export type ForkGlobalSettings = {
  /** Default-worktree switch: when true, sleep both worktrees' agents and resume each
   *  in the worktree that now holds its branch (agents follow); when false, agents
   *  stay put and their branch changes under them. */
  defaultSwitchAgentsFollow?: boolean
  /** Default-worktree switch: seed each affected agent with a one-line note about the
   *  branch/location change on the next turn. */
  defaultSwitchNotifyAgents?: boolean
  /** Set once the first-run explanation of the in-place branch swap was read. */
  defaultSwitchWarningAcknowledged?: boolean
  /** Which side's agents the switch note reaches: both, only the branch being
   *  promoted, or only the one leaving the default path. */
  defaultSwitchNotifyScope?: 'both' | 'promoted' | 'demoted'
  /** Default-worktree switch: when true (the default for older profiles too), untracked
   *  files travel with their branch; when false they stay in the folder they are in and
   *  the branch swaps around them. */
  defaultSwitchKeepUntrackedInPlace?: boolean
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
}
