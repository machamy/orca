// Fork: preview table column widths the user dragged, remembered per file.
// Why localStorage: this is a per-device view preference. It never touches the
// markdown file or anything under the repo, so it can never end up in git.
const STORAGE_KEY = 'orca.markdown-preview.table-widths.v1'
// Bounds the store; the least recently resized files drop first.
const MAX_FILES = 200

type StoredTable = { columns: number; widths: (number | null)[] }
type StoredFile = { tables: Record<string, StoredTable>; touchedAt: number }
type StoredWidths = Record<string, StoredFile>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readTable(value: unknown): StoredTable | null {
  if (!isRecord(value) || !Number.isInteger(value.columns) || !Array.isArray(value.widths)) {
    return null
  }
  const columns = Number(value.columns)
  const widths = value.widths.map((width) =>
    typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : null
  )
  return widths.length === columns ? { columns, widths } : null
}

function readStore(): StoredWidths {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!isRecord(parsed)) {
      return {}
    }
    const store: StoredWidths = {}
    for (const [filePath, file] of Object.entries(parsed)) {
      if (!isRecord(file) || !isRecord(file.tables)) {
        continue
      }
      const tables: Record<string, StoredTable> = {}
      for (const [tableIndex, table] of Object.entries(file.tables)) {
        const valid = readTable(table)
        if (valid) {
          tables[tableIndex] = valid
        }
      }
      const touchedAt = typeof file.touchedAt === 'number' ? file.touchedAt : 0
      store[filePath] = { tables, touchedAt }
    }
    return store
  } catch {
    return {}
  }
}

function writeStore(store: StoredWidths): void {
  try {
    const files = Object.entries(store)
    if (files.length === 0) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    const kept = files.sort(([, a], [, b]) => b.touchedAt - a.touchedAt).slice(0, MAX_FILES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // Resizing still works for this view when browser storage is unavailable or full.
  }
}

/** Saved widths for one table, or null when none are saved or the column count changed. */
export function loadMarkdownTableColumnWidths(
  filePath: string,
  tableIndex: number,
  columnCount: number
): (number | null)[] | null {
  const table = readStore()[filePath]?.tables[String(tableIndex)]
  return table && table.columns === columnCount ? table.widths : null
}

/** Saves one table's widths; all-null (every column back to auto) forgets the table. */
export function saveMarkdownTableColumnWidths(
  filePath: string,
  tableIndex: number,
  widths: (number | null)[],
  now: number = Date.now()
): void {
  const store = readStore()
  const file = store[filePath] ?? { tables: {}, touchedAt: now }
  if (widths.every((width) => width === null)) {
    delete file.tables[String(tableIndex)]
  } else {
    file.tables[String(tableIndex)] = { columns: widths.length, widths }
  }
  file.touchedAt = now
  if (Object.keys(file.tables).length === 0) {
    delete store[filePath]
  } else {
    store[filePath] = file
  }
  writeStore(store)
}
