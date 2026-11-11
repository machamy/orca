import { notApplicableDisposition } from './wsl-move-dispositions'
import type { WslMoveFieldDisposition } from './wsl-move-dispositions'

/** Fork-only localStorage module: markdown preview table column widths keyed by file path. */
export const MARKDOWN_TABLE_WIDTH_STORAGE_DISPOSITIONS: Record<string, WslMoveFieldDisposition> = {
  'src/renderer/src/components/editor/markdown-preview-table-widths-storage.ts':
    notApplicableDisposition(
      72,
      'View-only column widths; a moved file reopens at natural widths, which the reader can redrag.'
    )
}
