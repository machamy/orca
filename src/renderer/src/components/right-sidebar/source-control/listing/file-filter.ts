import { isClipboardTextByteLengthOverLimit } from '../../../../../../shared/clipboard-text'

export const SOURCE_CONTROL_FILE_FILTER_QUERY_MAX_BYTES = 2 * 1024

export type SourceControlFileFilterState = {
  normalizedFilter: string
  tooLarge: boolean
  /** Fork: lower-cased suffixes (`.cs`, `.cs.meta`) when every token is written as an
   *  extension; null keeps the plain substring match. */
  extensionSuffixes: string[] | null
}

// Why a leading dot decides the mode: `.cs` is how people type an extension, and a
// bare word (`assets`) must keep matching folders. A suffix match is what makes
// `.cs` stop dragging in `Foo.cs.meta`, `Foo.csproj` and `style.css`.
const EXTENSION_TOKEN = /^\*?\.([a-z0-9]+(?:\.[a-z0-9]+)*)$/

/** Fork: `.cs .json` / `*.cs, *.md` → `['.cs', '.json']`; anything else → null. */
export function parseSourceControlExtensionFilter(trimmedLowerQuery: string): string[] | null {
  const tokens = trimmedLowerQuery.split(/[\s,]+/).filter(Boolean)
  if (tokens.length === 0) {
    return null
  }
  const suffixes: string[] = []
  for (const token of tokens) {
    const match = EXTENSION_TOKEN.exec(token)
    if (!match) {
      return null
    }
    suffixes.push(`.${match[1]}`)
  }
  return [...new Set(suffixes)]
}

export type SourceControlPathEntry = {
  path: string
}

export type SourceControlGroupedPathEntries<T extends SourceControlPathEntry> = {
  staged: T[]
  unstaged: T[]
  untracked: T[]
}

export function isSourceControlFileFilterQueryTooLarge(
  query: string,
  maxBytes = SOURCE_CONTROL_FILE_FILTER_QUERY_MAX_BYTES
): boolean {
  return isClipboardTextByteLengthOverLimit(query, maxBytes)
}

export function getSourceControlFileFilterState(query: string): SourceControlFileFilterState {
  if (isSourceControlFileFilterQueryTooLarge(query)) {
    return { normalizedFilter: '', tooLarge: true, extensionSuffixes: null }
  }
  const trimmed = query.trim()
  if (!trimmed) {
    return { normalizedFilter: '', tooLarge: false, extensionSuffixes: null }
  }
  const normalizedFilter = trimmed.toLowerCase()
  return {
    normalizedFilter,
    tooLarge: false,
    extensionSuffixes: parseSourceControlExtensionFilter(normalizedFilter)
  }
}

export function filterSourceControlPathEntries<T extends SourceControlPathEntry>(
  entries: T[],
  filter: SourceControlFileFilterState
): T[] {
  if (filter.tooLarge) {
    return []
  }
  if (!filter.normalizedFilter) {
    return entries
  }
  const { extensionSuffixes } = filter
  if (extensionSuffixes) {
    return entries.filter((entry) => {
      const path = entry.path.toLowerCase()
      return extensionSuffixes.some((suffix) => path.endsWith(suffix))
    })
  }
  return entries.filter((entry) => entry.path.toLowerCase().includes(filter.normalizedFilter))
}

export function filterSourceControlGroupedPathEntries<T extends SourceControlPathEntry>(
  grouped: SourceControlGroupedPathEntries<T>,
  filter: SourceControlFileFilterState
): SourceControlGroupedPathEntries<T> {
  if (filter.tooLarge) {
    return { staged: [], unstaged: [], untracked: [] }
  }
  if (!filter.normalizedFilter) {
    return grouped
  }
  return {
    staged: filterSourceControlPathEntries(grouped.staged, filter),
    unstaged: filterSourceControlPathEntries(grouped.unstaged, filter),
    untracked: filterSourceControlPathEntries(grouped.untracked, filter)
  }
}
