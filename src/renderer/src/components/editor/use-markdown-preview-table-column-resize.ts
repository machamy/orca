import { useEffect, useLayoutEffect, type RefObject } from 'react'
import {
  loadMarkdownTableColumnWidths,
  saveMarkdownTableColumnWidths
} from './markdown-preview-table-widths-storage'

// Fork: drag a preview table's header-cell edge to resize that column; double-click
// resets it. View-only — the markdown is untouched and widths are remembered per file.

const EDGE_HIT_PX = 6
const MIN_COLUMN_PX = 40
const EDGE_CLASS = 'is-column-resize-edge'
const RESIZING_CLASS = 'is-resizing-table-column'
// Marks widths this feature set, so reapplying never clears a width it does not own.
const OWNED_WIDTH_ATTR = 'data-orca-column-width'

export function isNearColumnEdge(cellRight: number, clientX: number): boolean {
  return clientX <= cellRight + 2 && cellRight - clientX <= EDGE_HIT_PX
}

export function resizedColumnWidth(startWidth: number, deltaX: number): number {
  return Math.max(MIN_COLUMN_PX, Math.round(startWidth + deltaX))
}

function headerCells(table: HTMLTableElement): HTMLTableCellElement[] {
  const row = table.querySelector(':scope > thead > tr, :scope > tbody > tr, :scope > tr')
  if (!row) {
    return []
  }
  return [...row.querySelectorAll(':scope > th, :scope > td')].filter(
    (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement
  )
}

function setColumnWidth(cell: HTMLTableCellElement, width: number | null): void {
  if (width === null) {
    if (cell.hasAttribute(OWNED_WIDTH_ATTR)) {
      cell.style.removeProperty('width')
      cell.style.removeProperty('min-width')
      cell.removeAttribute(OWNED_WIDTH_ATTR)
    }
    return
  }
  cell.style.width = `${width}px`
  cell.style.minWidth = `${width}px`
  cell.setAttribute(OWNED_WIDTH_ATTR, String(width))
}

function ownedWidths(table: HTMLTableElement): (number | null)[] {
  return headerCells(table).map((cell) => {
    const width = Number(cell.getAttribute(OWNED_WIDTH_ATTR))
    return width > 0 ? width : null
  })
}

function edgeCellAt(body: HTMLElement, event: MouseEvent): HTMLTableCellElement | null {
  const cell = event.target instanceof Element ? event.target.closest('th') : null
  if (!(cell instanceof HTMLTableCellElement) || !body.contains(cell)) {
    return null
  }
  const table = cell.closest('table')
  if (!table || !headerCells(table).includes(cell)) {
    return null
  }
  return isNearColumnEdge(cell.getBoundingClientRect().right, event.clientX) ? cell : null
}

export function useMarkdownPreviewTableColumnResize(
  bodyRef: RefObject<HTMLDivElement | null>,
  filePath: string,
  renderedContent: string
): void {
  // Reapply after every render: a content change can rebuild the table rows.
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }
    body.querySelectorAll('table').forEach((table, tableIndex) => {
      const cells = headerCells(table)
      const saved = loadMarkdownTableColumnWidths(filePath, tableIndex, cells.length)
      cells.forEach((cell, column) => setColumnWidth(cell, saved?.[column] ?? null))
    })
  }, [bodyRef, filePath, renderedContent])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }
    let hovered: HTMLTableCellElement | null = null
    let drag: { cell: HTMLTableCellElement; startX: number; startWidth: number } | null = null
    let swallowClick = false

    const tableIndexOf = (cell: HTMLTableCellElement): number => {
      const table = cell.closest('table')
      return table ? [...body.querySelectorAll('table')].indexOf(table) : -1
    }
    const persist = (cell: HTMLTableCellElement): void => {
      const table = cell.closest('table')
      const tableIndex = tableIndexOf(cell)
      if (table && tableIndex >= 0) {
        saveMarkdownTableColumnWidths(filePath, tableIndex, ownedWidths(table))
      }
    }
    const setHovered = (cell: HTMLTableCellElement | null): void => {
      if (hovered !== cell) {
        hovered?.classList.remove(EDGE_CLASS)
        cell?.classList.add(EDGE_CLASS)
        hovered = cell
      }
    }

    const onPointerMove = (event: PointerEvent): void => {
      if (drag) {
        setColumnWidth(drag.cell, resizedColumnWidth(drag.startWidth, event.clientX - drag.startX))
        return
      }
      setHovered(edgeCellAt(body, event))
    }
    const onPointerDown = (event: PointerEvent): void => {
      const cell = event.button === 0 ? edgeCellAt(body, event) : null
      if (!cell) {
        return
      }
      event.preventDefault()
      drag = { cell, startX: event.clientX, startWidth: cell.getBoundingClientRect().width }
      body.setPointerCapture(event.pointerId)
      body.classList.add(RESIZING_CLASS)
    }
    const onPointerUp = (event: PointerEvent): void => {
      if (!drag) {
        return
      }
      const moved = event.clientX !== drag.startX
      if (moved) {
        persist(drag.cell)
        // Why: the click that ends a drag must not reach the review-note block handler.
        swallowClick = true
      }
      body.releasePointerCapture(event.pointerId)
      body.classList.remove(RESIZING_CLASS)
      drag = null
    }
    const onClickCapture = (event: MouseEvent): void => {
      if (swallowClick) {
        swallowClick = false
        event.stopPropagation()
        event.preventDefault()
      }
    }
    const onDoubleClick = (event: MouseEvent): void => {
      const cell = edgeCellAt(body, event)
      if (!cell) {
        return
      }
      event.preventDefault()
      setColumnWidth(cell, null)
      persist(cell)
    }

    body.addEventListener('pointermove', onPointerMove)
    body.addEventListener('pointerdown', onPointerDown)
    body.addEventListener('pointerup', onPointerUp)
    body.addEventListener('pointercancel', onPointerUp)
    body.addEventListener('click', onClickCapture, true)
    body.addEventListener('dblclick', onDoubleClick)
    return () => {
      setHovered(null)
      body.classList.remove(RESIZING_CLASS)
      body.removeEventListener('pointermove', onPointerMove)
      body.removeEventListener('pointerdown', onPointerDown)
      body.removeEventListener('pointerup', onPointerUp)
      body.removeEventListener('pointercancel', onPointerUp)
      body.removeEventListener('click', onClickCapture, true)
      body.removeEventListener('dblclick', onDoubleClick)
    }
  }, [bodyRef, filePath])
}
