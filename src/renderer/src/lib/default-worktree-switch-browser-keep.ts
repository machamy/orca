// Fork: a default-worktree switch sleeps through main's workspace sleep, whose notice the
// follower handles; these ids free their guests but keep browser records for the migration.
const keepBrowserStateIds = new Set<string>()

export async function withDefaultSwitchBrowserKeep<T>(
  worktreeIds: readonly string[],
  run: () => Promise<T>
): Promise<T> {
  for (const id of worktreeIds) {
    keepBrowserStateIds.add(id)
  }
  try {
    return await run()
  } finally {
    for (const id of worktreeIds) {
      keepBrowserStateIds.delete(id)
    }
  }
}

export function keepsBrowserStateThroughSleep(worktreeId: string): boolean {
  return keepBrowserStateIds.has(worktreeId)
}
