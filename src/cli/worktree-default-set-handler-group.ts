import type { HandlerGroup } from './handler-group-manifest'

/** Fork: `orca worktree default set`, kept beside upstream's own group modules. */
export const WORKTREE_DEFAULT_SET_HANDLER_GROUP: HandlerGroup = {
  name: 'worktree-default-set',
  keys: ['worktree default set'],
  load: async () =>
    (await import('./handlers/worktree-default-set.js')).WORKTREE_DEFAULT_SET_HANDLERS
}
