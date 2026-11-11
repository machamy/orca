import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { WORKTREE_LISTING_SCOPE_NOTES } from './worktree-listing-scope-notes'
import { WORKTREE_CREATE_COMMAND_SPEC } from './worktree-create'
import { WORKTREE_SET_COMMAND_SPEC } from './worktree-set'
import { SERVE_COMMAND_SPECS } from './serve'
import { TERMINAL_COMMAND_SPECS } from './terminal'
import { WORKTREE_DEFAULT_SET_SPECS } from './worktree-default-set'
import { REPO_COMMAND_SPECS } from './repo'

export const CORE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['open'],
    summary: 'Launch Orca and wait for the runtime to be reachable',
    usage: 'orca open [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca open', 'orca open --json']
  },
  ...SERVE_COMMAND_SPECS,
  {
    path: ['status'],
    summary: 'Show app/runtime/graph readiness',
    usage: 'orca status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      "caller.orcaSessionId is this agent's Orca session ID, as Orca resolved it, when the agent runs as an Orca session; otherwise caller is omitted."
    ],
    examples: ['orca status', 'orca status --json']
  },
  {
    path: ['claude-teams'],
    argumentMode: 'passthrough',
    summary: 'Start Claude Code Agent Teams in the current Orca terminal',
    usage: 'orca claude-teams [claude args...]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Passes all following arguments through to Claude Code after enabling Agent Teams native panes.',
      'Must be run from inside an Orca terminal. Starts Claude Code Agent Teams in the current pane and opens teammates as native Orca splits.'
    ],
    examples: ['orca claude-teams', 'orca claude-teams --resume <session-id>']
  },
  ...REPO_COMMAND_SPECS,
  {
    path: ['worktree', 'list'],
    summary: 'List Orca-managed worktrees',
    usage: 'orca worktree list [--repo <selector>] [--limit <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo', 'limit'],
    notes: [...WORKTREE_LISTING_SCOPE_NOTES]
  },
  {
    path: ['worktree', 'show'],
    summary: 'Show one worktree',
    usage: 'orca worktree show --worktree <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  ...WORKTREE_DEFAULT_SET_SPECS,
  {
    path: ['worktree', 'activate'],
    summary: 'Open a worktree on its host, waking a sleeping recipe VM behind it',
    usage: 'orca worktree activate --worktree <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree'],
    notes: [
      'With --environment naming a recipe VM that is asleep, Orca on this computer wakes the VM first and waits for it.',
      'Folder workspaces cannot be activated from the CLI yet; open them from the Orca sidebar.'
    ],
    examples: ['orca worktree activate --worktree branch:fix-login --environment sandbox']
  },
  {
    path: ['worktree', 'current'],
    summary: 'Show the Orca-managed worktree for the current directory',
    usage: 'orca worktree current [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Resolves the current shell directory to a path: selector so agents can target the enclosing Orca worktree without spelling out $PWD.'
    ],
    examples: ['orca worktree current', 'orca worktree current --json']
  },
  WORKTREE_CREATE_COMMAND_SPEC,
  WORKTREE_SET_COMMAND_SPEC,
  {
    path: ['worktree', 'rm'],
    aliases: [
      ['worktree', 'remove'],
      ['worktree', 'delete']
    ],
    destructive: true,
    summary: 'Remove a Git worktree or a folder workspace entry from Orca',
    usage:
      'orca worktree rm --worktree <selector> [--force] [--delete-branch] [--run-hooks] [--allow-failed-archive-hook] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'worktree',
      'force',
      'delete-branch',
      'run-hooks',
      'allow-failed-archive-hook'
    ],
    notes: [
      'Needs an explicit workspace: --worktree current and active are refused, and the error names the selector they resolve to right now, as `git worktree remove` needs a path. For a non-root folder workspace, removes its Orca entry and stops its sessions without deleting the folder or touching Git. The folder project root cannot be removed with this command. For a group folder workspace (folder:<id>, or a path:/name: selector that matches one), Orca forgets it and the folder stays on disk; --delete-branch, --run-hooks and --allow-failed-archive-hook are refused for it.',
      'Use --worktree "id:<full-instance-id>" with the full id from orca worktree list --json to select one folder workspace; several entries can share the same path.',
      'Repo-defined orca.yaml archive hooks are skipped unless --run-hooks is passed.',
      'With --run-hooks, a failed archive hook blocks the removal: nothing is stopped, deleted or deregistered, and the command exits non-zero with error code worktree_archive_hook_failed. --force does not waive this.',
      'Pass --allow-failed-archive-hook to delete anyway after the hook has run and failed; the waived failure is reported back on result.archiveHookOverride. It requires --run-hooks and is rejected without it, because with no hook running there is no failure to waive.',
      'On newer hosts with branch-choice support, Git worktree removal keeps the local branch, including with --force. Pass --delete-branch to attempt safe branch deletion, including branches that predated the worktree. Branches whose changes Orca cannot prove are already merged are retained. Older hosts keep their existing branch policy and print a warning; keep-by-default and --delete-branch do not apply there. A removal result without branch evidence does not confirm branch deletion.'
    ]
  },
  {
    path: ['worktree', 'ps'],
    summary: 'Show a compact orchestration summary across worktrees',
    usage: 'orca worktree ps [--limit <n>] [--agent-wait] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'limit', 'agent-wait'],
    notes: [
      ...WORKTREE_LISTING_SCOPE_NOTES,
      'JSON omits agentWait by default; pass --agent-wait to add the `terminal show` wait verdict to each terminal-backed agent row on the returned page.'
    ]
  },
  ...TERMINAL_COMMAND_SPECS
]
