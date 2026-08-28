/**
 * Character ranges of markdown code (fenced blocks, indented blocks, inline
 * spans) so callers can treat HTML tags inside them as literal text, not
 * structure.
 */

export function isInsideRange(index: number, ranges: [number, number][]): boolean {
  return ranges.some(([start, end]) => index >= start && index < end)
}

function markdownFenceRanges(content: string): [number, number][] {
  const ranges: [number, number][] = []
  let offset = 0
  let openFence: { marker: '`' | '~'; length: number; start: number } | null = null

  for (const lineMatch of content.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)) {
    const line = lineMatch[0]
    if (line === '') {
      break
    }

    const lineText = line.replace(/(?:\r\n|\n|\r)$/u, '')
    if (openFence) {
      const closingFencePattern =
        openFence.marker === '`'
          ? new RegExp(`^ {0,3}\`{${openFence.length},}\\s*$`)
          : new RegExp(`^ {0,3}~{${openFence.length},}\\s*$`)
      if (closingFencePattern.test(lineText)) {
        ranges.push([openFence.start, offset + line.length])
        openFence = null
      }
    } else {
      const openingFenceMatch = lineText.match(/^ {0,3}(`{3,}|~{3,})/u)
      if (openingFenceMatch?.[1]) {
        openFence = {
          marker: openingFenceMatch[1][0] as '`' | '~',
          length: openingFenceMatch[1].length,
          start: offset
        }
      }
    }

    offset += line.length
  }

  if (openFence) {
    ranges.push([openFence.start, content.length])
  }

  return ranges
}

// CommonMark counts indentation in columns, with tab stops of 4.
function expandedIndentWidth(lineText: string): number {
  let width = 0
  for (const char of lineText) {
    if (char === ' ') {
      width += 1
    } else if (char === '\t') {
      width += 4 - (width % 4)
    } else {
      break
    }
  }
  return width
}

const LIST_MARKER_PATTERN = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/

/**
 * CommonMark indented code blocks: chunks of 4+-column lines, blank-line
 * separated, that cannot interrupt a paragraph. Deliberately conservative in
 * one direction: inside a list, 4-column indentation is usually item
 * continuation, so NOTHING under an open list is treated as indented code —
 * under-masking there keeps a real `</details>` working; over-masking would
 * silently swallow it. The list stays "open" until its unambiguous terminator
 * (blank line, then a flush-left non-list line).
 */
function markdownIndentedCodeRanges(
  content: string,
  fenceRanges: [number, number][]
): [number, number][] {
  const ranges: [number, number][] = []
  let offset = 0
  let openBlock: { start: number; end: number } | null = null
  // Doc start counts as a blank predecessor: a leading indented chunk is code.
  let previousLineBlank = true
  let listContext = false

  const closeOpenBlock = (): void => {
    if (openBlock) {
      ranges.push([openBlock.start, openBlock.end])
      openBlock = null
    }
  }

  for (const lineMatch of content.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)) {
    const line = lineMatch[0]
    if (line === '') {
      break
    }
    const lineText = line.replace(/(?:\r\n|\n|\r)$/u, '')

    if (isInsideRange(offset, fenceRanges)) {
      // Fence content is already masked; it neither starts nor continues a chunk.
      closeOpenBlock()
      previousLineBlank = false
      offset += line.length
      continue
    }

    if (/^[ \t]*$/.test(lineText)) {
      // Interior blanks keep the block open pending another 4+-column line.
      previousLineBlank = true
      offset += line.length
      continue
    }

    if (expandedIndentWidth(lineText) >= 4) {
      if (openBlock) {
        openBlock.end = offset + line.length
      } else if (previousLineBlank && !listContext) {
        openBlock = { start: offset, end: offset + line.length }
      }
      // else: a paragraph's lazy continuation or list content — never code.
      previousLineBlank = false
      offset += line.length
      continue
    }

    closeOpenBlock()
    if (LIST_MARKER_PATTERN.test(lineText)) {
      listContext = true
    } else if (previousLineBlank && expandedIndentWidth(lineText) === 0) {
      listContext = false
    }
    previousLineBlank = false
    offset += line.length
  }

  closeOpenBlock()
  return ranges
}

// ATX headings can interrupt anything; thematic breaks too. Requiring the space
// after `#` keeps `#hashtag` lines out (CommonMark says they are not headings).
const ATX_HEADING_LINE = /^ {0,3}#{1,6}(?:[ \t]|$)/
const THEMATIC_BREAK_LINE = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/

// A heading or thematic break is a one-line leaf block: a span can neither
// enter nor leave it, so both line edges are barriers. Conservative on purpose
// — a missed barrier under-masks, which keeps real tags structural.
function leafBlockLineBarriers(content: string): number[] {
  const barriers: number[] = []
  let offset = 0
  for (const lineMatch of content.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)) {
    const line = lineMatch[0]
    if (line === '') {
      break
    }
    const lineText = line.replace(/(?:\r\n|\n|\r)$/u, '')
    if (ATX_HEADING_LINE.test(lineText) || THEMATIC_BREAK_LINE.test(lineText)) {
      barriers.push(offset, offset + lineText.length)
    }
    offset += line.length
  }
  return barriers
}

// Inline parsing stops at leaf-block boundaries: blank lines, code blocks,
// heading/thematic-break lines. A span may cross a plain line break, but never
// one of these positions.
function inlineSpanBarriers(content: string, blockRanges: [number, number][]): number[] {
  const blankLineBarriers = [...content.matchAll(/(?:\r\n|\n|\r)(?=[ \t]*(?:\r\n|\n|\r|$))/g)].map(
    (gap) => gap.index
  )
  return [
    ...blankLineBarriers,
    ...blockRanges.map(([start]) => start),
    ...leafBlockLineBarriers(content)
  ].sort((a, b) => a - b)
}

// CommonMark: a code span closes only on a backtick run of EXACTLY the opening
// length; other runs stay literal inside the span, an unmatched opener is text.
// Spans may cross line breaks (a `</details>` inside one is still code), so the
// runs are matched across the whole document, fenced/indented regions excluded.
function markdownInlineCodeRanges(
  content: string,
  blockRanges: [number, number][]
): [number, number][] {
  const runs = [...content.matchAll(/`+/g)]
    .filter((run) => !isInsideRange(run.index, blockRanges))
    .map((run) => ({ start: run.index, length: run[0].length }))
  const barriers = inlineSpanBarriers(content, blockRanges)

  const ranges: [number, number][] = []
  let runIndex = 0
  while (runIndex < runs.length) {
    const opener = runs[runIndex]!
    const barrier = barriers.find((position) => position >= opener.start + opener.length)
    const closerIndex = runs.findIndex(
      (run, index) =>
        index > runIndex &&
        run.length === opener.length &&
        (barrier === undefined || run.start < barrier)
    )
    if (closerIndex === -1) {
      runIndex += 1
      continue
    }
    const closer = runs[closerIndex]!
    ranges.push([opener.start, closer.start + closer.length])
    runIndex = closerIndex + 1
  }
  return ranges
}

export function markdownCodeRanges(content: string): [number, number][] {
  const fenceRanges = markdownFenceRanges(content)
  const blockRanges = [...fenceRanges, ...markdownIndentedCodeRanges(content, fenceRanges)]
  return [...blockRanges, ...markdownInlineCodeRanges(content, blockRanges)]
}
