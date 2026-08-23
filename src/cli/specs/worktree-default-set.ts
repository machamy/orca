import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKTREE_DEFAULT_SET_SPECS: CommandSpec[] = [
  {
    path: ['worktree', 'default', 'set'],
    summary: 'Check the selected branch out at the repo default path',
    usage: 'orca worktree default set --worktree <selector> [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'worktree',
      'follow-agents',
      'notify-agents',
      'ui-flow',
      'keep-untracked-in-place'
    ],
    notes: [
      "Swaps the two worktrees' branches in place: the selected branch checks out at the repo path and the old default branch at the selected worktree. No folders move, so git's main worktree stays put; uncommitted changes follow their branch.",
      'Local Git worktrees only. SSH, WSL, and folder workspaces currently return a safe unsupported error.',
      '--keep-untracked-in-place leaves untracked files in the folder they are in; by default they travel with their branch alongside the tracked changes.',
      "--follow-agents swaps the two workspaces' slept agent sessions so each agent resumes where its branch now lives. Pair it with --ui-flow so the desktop app runs the full sleep -> swap -> wake flow (async; observe completion via worktree list)."
    ],
    examples: [
      'orca worktree default set --worktree active --json',
      'orca worktree default set --worktree branch:feature --follow-agents --ui-flow --json'
    ]
  }
]
