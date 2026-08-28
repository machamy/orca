import { isUnsupportedWorktreeRepairError } from '../../shared/git-worktree-command-capabilities'
import { getLocalGitCapabilityCache } from './git-capability-state'
import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'
import { gitExecFileAsync } from './runner'

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
