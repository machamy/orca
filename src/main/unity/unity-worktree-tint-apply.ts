import { readUnityEditorVersion } from './unity-project-worktree'
import { syncUnityWorktreeTint } from './unity-worktree-tint'
import type { UnityTintApplyResult } from '../../shared/unity-worktree'

/**
 * Re-writes the tint script immediately after a colour choice in the worktree
 * context menu — without opening Unity. Guarded to real Unity projects so a
 * colour click can never create an Assets/ tree in an ordinary repo. A running
 * editor picks the change up on its next script reload (focus).
 *
 * "No colour" needs no flag of its own: the reserved `'none'` override travels
 * in `tintOverridesByLabel`, and `syncUnityWorktreeTint` turns it into the same
 * removal `enabled: false` performs.
 */
export async function applyUnityWorktreeTint(args: {
  worktreePath: string
  enabled: boolean
  label?: string
  tintSiblingLabels?: readonly string[]
  tintOverridesByLabel?: Readonly<Record<string, string>>
}): Promise<UnityTintApplyResult> {
  if ((await readUnityEditorVersion(args.worktreePath)) === null) {
    return { applied: false, outcome: 'not_a_unity_project' }
  }
  const outcome = await syncUnityWorktreeTint({
    worktreePath: args.worktreePath,
    enabled: args.enabled,
    ...(args.label ? { label: args.label } : {}),
    ...(args.tintSiblingLabels ? { siblingLabels: args.tintSiblingLabels } : {}),
    ...(args.tintOverridesByLabel ? { overridesByLabel: args.tintOverridesByLabel } : {})
  })
  return {
    applied: outcome === 'written' || outcome === 'removed' || outcome === 'unchanged',
    outcome
  }
}
