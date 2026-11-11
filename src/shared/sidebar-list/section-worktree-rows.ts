import type { SectionAppendContext } from './group-sections'
import { appendWorktreeRowsWithFolders } from './worktree-folder-rows'

/** Fork: one section's worktree rows, with worktree folders when the window resolved any. */
export function appendSectionWorktreeRows(
  ctx: SectionAppendContext,
  section: {
    sectionKey: string
    groupDepth: number
    hostContextLabelByRepoId?: ReadonlyMap<string, string>
  }
): void {
  appendWorktreeRowsWithFolders(
    ctx.result,
    ctx.repoOf,
    ctx.occurrencePlan,
    {
      ...section,
      collapsedGroups: ctx.collapsedGroups,
      hostContextLabelByWorktreeIdentity: ctx.mixedWorktreeHostContextLabels,
      folderPairByIdentity: ctx.folderPairByIdentity,
      groupBy: ctx.groupBy,
      defaultHostId: ctx.defaultHostId,
      repoMap: ctx.repoMap
    },
    ctx.worktreeFolderModel ?? null
  )
}
