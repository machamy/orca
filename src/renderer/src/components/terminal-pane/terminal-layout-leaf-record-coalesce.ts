// Merging the per-leaf records (pty ids, buffers, scrollback refs) when two
// leaves collapse into one. Split out from the ownership normalizer so that file
// stays about deciding WHICH leaf wins, not about rewriting every record keyed
// by the loser.
export function resolveRetainedLeafId(
  leafId: string,
  retainedLeafIdByRemovedLeafId: ReadonlyMap<string, string>
): string {
  let retainedLeafId = leafId
  while (retainedLeafIdByRemovedLeafId.has(retainedLeafId)) {
    const nextLeafId = retainedLeafIdByRemovedLeafId.get(retainedLeafId)
    if (!nextLeafId || nextLeafId === retainedLeafId) {
      return retainedLeafId
    }
    retainedLeafId = nextLeafId
  }
  return retainedLeafId
}

export function coalesceLeafRecord(
  source: Record<string, string> | undefined,
  retainedLeafIdByRemovedLeafId: ReadonlyMap<string, string>
): Record<string, string> | undefined {
  if (!source) {
    return undefined
  }
  const retained = Object.fromEntries(
    Object.entries(source).filter(([leafId]) => {
      const retainedLeafId = retainedLeafIdByRemovedLeafId.get(leafId)
      return retainedLeafId === undefined || retainedLeafId === leafId
    })
  )
  for (const [removedLeafId, value] of Object.entries(source)) {
    if (!retainedLeafIdByRemovedLeafId.has(removedLeafId)) {
      continue
    }
    const retainedLeafId = resolveRetainedLeafId(removedLeafId, retainedLeafIdByRemovedLeafId)
    if (!Object.hasOwn(retained, retainedLeafId)) {
      retained[retainedLeafId] = value
    }
  }
  return Object.keys(retained).length > 0 ? retained : undefined
}

function hasLeafRecordValue(source: Record<string, string> | undefined, leafId: string): boolean {
  return Boolean(source && Object.hasOwn(source, leafId))
}

export function coalesceScrollbackRecords(
  buffersByLeafId: Record<string, string> | undefined,
  scrollbackRefsByLeafId: Record<string, string> | undefined,
  retainedLeafIdByRemovedLeafId: ReadonlyMap<string, string>,
  orderedLeafIds: readonly string[]
): {
  buffersByLeafId: Record<string, string> | undefined
  scrollbackRefsByLeafId: Record<string, string> | undefined
} {
  const affectedRetainedLeafIds = new Set<string>()
  for (const removedLeafId of retainedLeafIdByRemovedLeafId.keys()) {
    affectedRetainedLeafIds.add(resolveRetainedLeafId(removedLeafId, retainedLeafIdByRemovedLeafId))
  }

  const sourceLeafIdByRetainedLeafId = new Map<string, string>()
  for (const retainedLeafId of affectedRetainedLeafIds) {
    if (
      hasLeafRecordValue(buffersByLeafId, retainedLeafId) ||
      hasLeafRecordValue(scrollbackRefsByLeafId, retainedLeafId)
    ) {
      sourceLeafIdByRetainedLeafId.set(retainedLeafId, retainedLeafId)
    }
  }
  for (const leafId of orderedLeafIds) {
    const retainedLeafId = resolveRetainedLeafId(leafId, retainedLeafIdByRemovedLeafId)
    if (
      !affectedRetainedLeafIds.has(retainedLeafId) ||
      sourceLeafIdByRetainedLeafId.has(retainedLeafId)
    ) {
      continue
    }
    if (
      hasLeafRecordValue(buffersByLeafId, leafId) ||
      hasLeafRecordValue(scrollbackRefsByLeafId, leafId)
    ) {
      sourceLeafIdByRetainedLeafId.set(retainedLeafId, leafId)
    }
  }

  const coalesce = (
    source: Record<string, string> | undefined
  ): Record<string, string> | undefined => {
    if (!source) {
      return undefined
    }
    const retained = Object.fromEntries(
      Object.entries(source).filter(([leafId]) => {
        const retainedLeafId = resolveRetainedLeafId(leafId, retainedLeafIdByRemovedLeafId)
        return !affectedRetainedLeafIds.has(retainedLeafId)
      })
    )
    for (const [retainedLeafId, sourceLeafId] of sourceLeafIdByRetainedLeafId) {
      if (hasLeafRecordValue(source, sourceLeafId)) {
        retained[retainedLeafId] = source[sourceLeafId]!
      }
    }
    return Object.keys(retained).length > 0 ? retained : undefined
  }

  return {
    buffersByLeafId: coalesce(buffersByLeafId),
    scrollbackRefsByLeafId: coalesce(scrollbackRefsByLeafId)
  }
}
