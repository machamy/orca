import type { AgentType } from '../../../../shared/agent-status-types'

export const TITLE_AGENT_LABEL_TO_TYPE: Record<string, AgentType> = {
  'Claude Code': 'claude',
  OpenClaude: 'openclaude',
  Codex: 'codex',
  'Gemini CLI': 'gemini',
  'GitHub Copilot': 'copilot',
  Grok: 'grok',
  Devin: 'devin',
  Antigravity: 'antigravity',
  OpenCode: 'opencode',
  Aider: 'aider',
  Cursor: 'cursor',
  Droid: 'droid',
  Hermes: 'hermes',
  Pi: 'pi',
  OMP: 'omp'
}

/** Titles that name a shell rather than any work being done in it. */
const BARE_SHELL_TITLES = new Set([
  'sh',
  'bash',
  'zsh',
  'dash',
  'ksh',
  'ash',
  'fish',
  'nu',
  'pwsh',
  'powershell',
  'cmd',
  'cmd.exe'
])

// Fork: a bare shell name means the user left the agent, so its owner must not resurrect a row.
export function isBareShellTitle(title: string): boolean {
  return BARE_SHELL_TITLES.has(title.trim().toLowerCase())
}

// Why the launch agent may corroborate a split pane: `resolveTitleDerivedPaneOwner`
// refuses an owner for a split, and the identity resolver refuses a Claude-labelled
// title that does not literally say "claude" — so a 3-pane all-claude split whose
// panes are titled `✳ Remember token PANE-3` produced no rows at all and read as
// plain terminals. Requiring the title's OWN label to name this tab's agent keeps
// upstream's guard intact: a Claude-labelled title on a codex tab is contradictory
// evidence and still gets nothing.
export function resolveLaunchCorroboratedAgentType(
  label: string | null,
  launchAgent: string | null | undefined
): AgentType | null {
  const labelAgentType = label ? (TITLE_AGENT_LABEL_TO_TYPE[label] ?? null) : null
  return labelAgentType && labelAgentType === launchAgent ? labelAgentType : null
}
