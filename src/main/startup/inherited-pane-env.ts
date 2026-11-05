const PANE_ENV_NAME =
  /^(CLAUDE|ORCA_(AGENT_|APP_VERSION$|CLAUDE_|CLI_BIN_DIR$|CODEX_HOME$|IMAGE_PROTOCOL$|OPENCODE_|PANE_KEY$|RUNTIME_SOURCE_|TAB_ID$|TERMINAL_HANDLE$|USER_DATA_PATH$|WORKSPACE_ID$|WORKTREE_ID$))/

// An agent restarting Orca from a pane hands its session env to the app through `open`, and every new terminal would then run under that session's Claude account.
export function dropInheritedPaneEnv(env: NodeJS.ProcessEnv): void {
  if (env.CLAUDECODE === undefined && env.ORCA_PANE_KEY === undefined) {
    return
  }
  for (const name of Object.keys(env)) {
    if (PANE_ENV_NAME.test(name)) {
      delete env[name]
    }
  }
}
