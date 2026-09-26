// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadMarkdownTableColumnWidths,
  saveMarkdownTableColumnWidths
} from './markdown-preview-table-widths-storage'
import {
  isNearColumnEdge,
  resizedColumnWidth,
  useMarkdownPreviewTableColumnResize
} from './use-markdown-preview-table-column-resize'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const FILE = '/repo/doc.md'
let root: Root | null = null
let container: HTMLDivElement | null = null

function Preview({ content }: { content: string }): React.JSX.Element {
  const bodyRef = useRef<HTMLDivElement>(null)
  useMarkdownPreviewTableColumnResize(bodyRef, FILE, content)
  return (
    <div ref={bodyRef} className="markdown-body">
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>a</td>
            <td>{content}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function mount(content = 'x'): { body: HTMLDivElement; headers: HTMLTableCellElement[] } {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root?.render(<Preview content={content} />))
  const body = container.querySelector<HTMLDivElement>('.markdown-body')
  if (!body) {
    throw new Error('preview body not rendered')
  }
  return { body, headers: [...body.querySelectorAll('th')] }
}

function placeCell(cell: HTMLElement, right: number, width: number): void {
  cell.getBoundingClientRect = () => new DOMRect(right - width, 0, width, 20)
}

function pointer(target: Element, type: string, clientX: number): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX, button: 0, pointerId: 1 }))
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
  localStorage.clear()
})

describe('preview table column resize', () => {
  it('only treats the few pixels at a header cell edge as the handle', () => {
    expect(isNearColumnEdge(100, 97)).toBe(true)
    expect(isNearColumnEdge(100, 101)).toBe(true)
    expect(isNearColumnEdge(100, 80)).toBe(false)
    expect(resizedColumnWidth(100, -500)).toBe(40)
    expect(resizedColumnWidth(100, 52.4)).toBe(152)
  })

  it('applies widths saved for this file when the preview mounts', () => {
    saveMarkdownTableColumnWidths(FILE, 0, [null, 260])
    const { headers } = mount()
    expect(headers[0].style.width).toBe('')
    expect(headers[1].style.width).toBe('260px')
  })

  it('resizes a column by dragging its header edge and remembers it', () => {
    const { body, headers } = mount()
    body.setPointerCapture = () => {}
    body.releasePointerCapture = () => {}
    placeCell(headers[0], 100, 100)

    pointer(headers[0], 'pointermove', 98)
    expect(headers[0].classList.contains('is-column-resize-edge')).toBe(true)
    pointer(headers[0], 'pointerdown', 98)
    pointer(body, 'pointermove', 158)
    pointer(body, 'pointerup', 158)

    expect(headers[0].style.width).toBe('160px')
    expect(loadMarkdownTableColumnWidths(FILE, 0, 2)).toEqual([160, null])
  })

  it('keeps remembered widths across a content re-render', () => {
    saveMarkdownTableColumnWidths(FILE, 0, [180, null])
    mount('first')
    act(() => root?.render(<Preview content="second" />))
    const header = container?.querySelector('th')
    expect(header?.style.width).toBe('180px')
  })

  it('double-clicking the edge resets the column to auto and forgets it', () => {
    saveMarkdownTableColumnWidths(FILE, 0, [180, null])
    const { headers } = mount()
    placeCell(headers[0], 180, 180)
    headers[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 178 }))
    expect(headers[0].style.width).toBe('')
    expect(loadMarkdownTableColumnWidths(FILE, 0, 2)).toBeNull()
  })

  it('never changes the markdown source it is given', () => {
    const source = '| a | b |\n| - | - |\n| 1 | 2 |'
    const { body, headers } = mount(source)
    body.setPointerCapture = () => {}
    body.releasePointerCapture = () => {}
    placeCell(headers[1], 300, 100)
    pointer(headers[1], 'pointerdown', 299)
    pointer(body, 'pointerup', 350)
    expect(body.querySelectorAll('td')[1].textContent).toBe(source)
  })
})
