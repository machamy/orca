/**
 * Fork (default-worktree switch): combine a re-key's incoming value with
 * whatever already sits at the destination. Overwriting is what a plain
 * assignment does, and for tab lists that silently destroyed the destination
 * worktree's tabs. Lists merge (by id where the entries have one); for
 * anything else the incoming value wins, the historical behaviour for scalars.
 */
export function mergeReKeyedValue<T>(incoming: T, existing: T | undefined): T {
  if (existing === undefined || incoming === existing) {
    return incoming
  }
  if (!Array.isArray(incoming) || !Array.isArray(existing)) {
    return incoming
  }
  const merged = [...(existing as unknown[])]
  const seen = new Set(
    merged.map((entry) =>
      entry && typeof entry === 'object' && 'id' in entry
        ? String((entry as { id: unknown }).id)
        : entry
    )
  )
  for (const entry of incoming as unknown[]) {
    const key =
      entry && typeof entry === 'object' && 'id' in entry
        ? String((entry as { id: unknown }).id)
        : entry
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    merged.push(entry)
  }
  return merged as unknown as T
}
