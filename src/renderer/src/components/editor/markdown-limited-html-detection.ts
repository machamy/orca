/**
 * Detects raw HTML that the default markdown preview will strip.
 *
 * The preview sanitizes with rehype-sanitize's default schema, which is itself
 * GitHub-derived — so most HTML in a README already survives, and the notice
 * this drives must stay quiet for those files. The list below is the measured
 * difference between the two schemas, not a guess: everything here is dropped
 * today and rendered by the GitHub-flavored schema
 * (see markdown-preview-sanitize-schemas.test.ts).
 *
 * `iframe` is deliberately absent — neither schema renders it, so offering the
 * wider view would promise something it does not deliver.
 *
 * Only HTML outside code is counted: a fenced block SHOWING `<video>` is
 * content, not markup.
 */
const STRIPPED_BY_DEFAULT = new Set([
  'video',
  'audio',
  'center',
  'font',
  'u',
  'mark',
  'figure',
  'figcaption',
  'abbr'
])

/** Leading blockquote markers, so a fence inside `>` quoting still reads as one. */
const BLOCKQUOTE_PREFIX = /^(?:\s{0,3}>)+\s?/

type Fence = { marker: string; length: number }

function openingFence(line: string): Fence | null {
  const body = line.replace(BLOCKQUOTE_PREFIX, '')
  const indent = body.length - body.trimStart().length
  if (indent > 3) {
    return null
  }
  const trimmed = body.trimStart()
  const marker = trimmed[0]
  if (marker !== '`' && marker !== '~') {
    return null
  }
  let length = 0
  while (trimmed[length] === marker) {
    length += 1
  }
  return length >= 3 ? { marker, length } : null
}

function closesFence(line: string, fence: Fence): boolean {
  const candidate = openingFence(line)
  return candidate !== null && candidate.marker === fence.marker && candidate.length >= fence.length
}

/**
 * Strips code and comments so only real markup is scanned.
 *
 * Line-based on purpose. The regex this replaced backtracked quadratically on a
 * run of backticks with no newline — a 200 KB README of them froze the renderer
 * for ~22s, and this scan runs on EVERY markdown file opened, not just the ones
 * that show the notice.
 */
function withoutCodeAndComments(markdown: string): string {
  const kept: string[] = []
  let fence: Fence | null = null
  let previousWasBlank = true
  for (const line of markdown.split('\n')) {
    if (fence) {
      if (closesFence(line, fence)) {
        fence = null
      }
      continue
    }
    const opening = openingFence(line)
    if (opening) {
      fence = opening
      continue
    }
    // Indented code block: only after a blank line, otherwise it is a wrapped
    // paragraph or a list continuation rather than code.
    const isBlank = line.trim().length === 0
    if (previousWasBlank && !isBlank && /^(?: {4}|\t)/.test(line)) {
      previousWasBlank = false
      continue
    }
    previousWasBlank = isBlank
    kept.push(line)
  }
  return kept
    .join('\n')
    .replace(/`[^`\n]*`/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
}

export function detectLimitedMarkdownHtml(markdown: string): {
  limited: boolean
  tags: string[]
} {
  const scannable = withoutCodeAndComments(markdown)
  const tags = new Set<string>()
  for (const match of scannable.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^<>]*)?>/g)) {
    const tag = (match[1] ?? '').toLowerCase()
    if (STRIPPED_BY_DEFAULT.has(tag)) {
      tags.add(tag)
    }
  }
  return { limited: tags.size > 0, tags: [...tags].sort() }
}
