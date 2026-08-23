import { defineMethod } from '../core'
import { WorktreeDefaultSetSelector } from './worktree-schemas'

/**
 * `worktree.defaultSet` — promote a worktree to the repo's default checkout.
 *
 * Lives apart from the other worktree methods because its follow mode spans two
 * processes: this handler re-keys persisted ownership and renames transcripts,
 * while the sleep that captures resume records and the wake that remounts them
 * belong to the host renderer.
 */
export const DEFAULT_SET_METHOD = defineMethod({
  name: 'worktree.defaultSet',
  params: WorktreeDefaultSetSelector,
  handler: async (params, { runtime, clientKind }) => {
    // Follow mode is only half a transaction on this side: it re-keys persisted
    // tab/session ownership and renames the transcript trees, while the sleep
    // that captures the resume records and the wake that remounts them belong
    // to this host's renderer. A remote caller cannot have done that half, so
    // its PTYs would keep running in the original cwd under tabs labelled as
    // the opposite worktree, with nothing to repair them — it must go through
    // `uiFlow` instead, which hands the whole flow to the renderer.
    //
    // Why gate on the caller and not simply on `uiFlow`: the renderer itself
    // calls this WITHOUT `uiFlow` (it is already inside the flow, mid-sleep),
    // so requiring the flag outright refused the sidebar's own follow switch.
    // `clientKind` is set only for paired remote connections; in-process
    // callers leave it undefined.
    if (params.followAgents === true && params.uiFlow !== true && clientKind !== undefined) {
      throw new Error('default_worktree_switch_follow_requires_ui_flow')
    }
    // uiFlow hands the request to the desktop renderer so the CLI exercises
    // the same sleep -> swap -> wake path as the sidebar dialog confirm.
    return params.uiFlow === true
      ? runtime.requestUiDefaultWorktreeSwitch(params.worktree, {
          followAgents: params.followAgents === true,
          notifyAgents: params.notifyAgents === true,
          includeUntracked: params.includeUntracked !== false
        })
      : runtime.setRuntimeDefaultWorktree(params.worktree, {
          followAgents: params.followAgents === true,
          notifyAgents: params.notifyAgents === true,
          includeUntracked: params.includeUntracked !== false
        })
  }
})
