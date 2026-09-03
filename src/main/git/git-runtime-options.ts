import type { GitAdmissionTier } from './command-runner/git-exec-options'

export type GitRuntimeOptions = {
  wslDistro?: string
  signal?: AbortSignal
  /** Kill the git process after this long. Omitted means no deadline, which is
   *  the right default for reads but wedges anything a hook can block. */
  timeoutMs?: number
  admissionTier?: GitAdmissionTier
}

export function gitOptionsForWorktree(
  cwd: string,
  options: GitRuntimeOptions = {}
): {
  cwd: string
  wslDistro?: string
  signal?: AbortSignal
  timeout?: number
  admissionTier?: GitAdmissionTier
} {
  return {
    cwd,
    ...(options.wslDistro ? { wslDistro: options.wslDistro } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
    ...(options.admissionTier ? { admissionTier: options.admissionTier } : {})
  }
}

/**
 * Options for a git invocation that only reads. Opting in explicitly keeps the
 * shell-free WSL route from depending on `wsl-direct-git-read-commands`
 * classifying the argv, which is a heuristic these call sites already know the
 * answer to.
 */
export function gitReadOptionsForWorktree(
  cwd: string,
  options: GitRuntimeOptions = {}
): {
  cwd: string
  wslDistro?: string
  signal?: AbortSignal
  timeout?: number
  admissionTier?: GitAdmissionTier
  preferWslDirectGit: true
} {
  return { ...gitOptionsForWorktree(cwd, options), preferWslDirectGit: true }
}
