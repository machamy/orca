/**
 * Web URL for a worktree's branch on its hosting provider.
 *
 * Built from the remote Orca already resolved (`canonicalKey` is `host/owner/repo`),
 * so it costs no git call and follows whichever remote the repo actually uses.
 *
 * Only hosts whose branch route we know are answered. Guessing a path for an
 * unknown host would hand the user a broken link that looks official.
 */
const BRANCH_PATH_BY_HOST: Record<string, (branch: string) => string> = {
  'github.com': (branch) => `tree/${branch}`,
  'gitlab.com': (branch) => `-/tree/${branch}`,
  'bitbucket.org': (branch) => `src/${branch}`,
  'codeberg.org': (branch) => `src/branch/${branch}`
}

export function buildWorktreeBranchWebUrl(args: {
  /** `host/owner/repo`, as resolved into the repo's git remote identity. */
  canonicalKey: string | null | undefined
  branch: string | null | undefined
}): string | null {
  const canonicalKey = args.canonicalKey?.trim()
  const branch = args.branch?.trim()
  if (!canonicalKey || !branch) {
    return null
  }
  const separator = canonicalKey.indexOf('/')
  if (separator <= 0) {
    return null
  }
  const host = canonicalKey.slice(0, separator)
  const repoPath = canonicalKey.slice(separator + 1)
  const branchPath = BRANCH_PATH_BY_HOST[host]
  if (!repoPath || !branchPath) {
    return null
  }
  // Encode per segment: a branch like `feature/a b` is a path, not one component.
  const encodedBranch = branch.split('/').map(encodeURIComponent).join('/')
  return `https://${host}/${repoPath}/${branchPath(encodedBranch)}`
}

/** Label for the provider, so the menu can say where the link goes. */
export function worktreeBranchWebHostLabel(canonicalKey: string | null | undefined): string | null {
  const host = canonicalKey?.trim().split('/')[0]
  if (!host || !BRANCH_PATH_BY_HOST[host]) {
    return null
  }
  return (
    {
      'github.com': 'GitHub',
      'gitlab.com': 'GitLab',
      'bitbucket.org': 'Bitbucket',
      'codeberg.org': 'Codeberg'
    }[host] ?? host
  )
}
