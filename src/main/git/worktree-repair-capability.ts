import { isUnsupportedWorktreeRepairError } from '../../shared/git/worktrees/git-worktree-command-capabilities'
import { getLocalGitCapabilityCache } from './command-runner/host-routing/git-capability-state'
import type { GitRuntimeOptions } from './command-runner/git-runtime-options'
import { gitOptionsForWorktree } from './command-runner/git-runtime-options'
import { gitExecFileAsync } from './command-runner/git-exec-file'

export async function repairMainWorktree(path: string, options: GitRuntimeOptions): Promise<void> {
  await gitExecFileAsync(['worktree', 'repair'], gitOptionsForWorktree(path, options))
}

export async function ensureWorktreeRepairSupported(
  mainPath: string,
  options: GitRuntimeOptions
): Promise<void> {
  const capabilities = getLocalGitCapabilityCache({ cwd: mainPath, wslDistro: options.wslDistro })
  await capabilities.runWithFallback(
    'worktree-repair',
    () => repairMainWorktree(mainPath, options),
    async () => {
      throw new Error('default_worktree_switch_git_repair_unsupported')
    },
    isUnsupportedWorktreeRepairError
  )
}
