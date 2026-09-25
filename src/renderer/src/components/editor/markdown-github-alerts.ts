/**
 * Fork: GitHub alert blocks (`> [!NOTE]` … `> [!CAUTION]`). Without this they render as a
 * plain quote that shows the literal marker, which is the first thing that reads "not GitHub".
 */

export const MARKDOWN_GITHUB_ALERT_TYPES = [
  'note',
  'tip',
  'important',
  'warning',
  'caution'
] as const
export type MarkdownGithubAlertType = (typeof MARKDOWN_GITHUB_ALERT_TYPES)[number]

// GitHub titles stay English whatever the page language; matching that is the point.
const ALERT_TITLES: Record<MarkdownGithubAlertType, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution'
}

const ALERT_MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\r?\n|$)/i

type MarkdownAlertNode = {
  type: string
  value?: string
  children?: MarkdownAlertNode[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

function readAlertType(quote: MarkdownAlertNode): MarkdownGithubAlertType | null {
  const paragraph = quote.children?.[0]
  const text = paragraph?.type === 'paragraph' ? paragraph.children?.[0] : undefined
  if (text?.type !== 'text' || typeof text.value !== 'string') {
    return null
  }
  const match = ALERT_MARKER.exec(text.value)
  if (!match) {
    return null
  }
  // GitHub only honors a marker that stands alone on its line.
  const rest = text.value.slice(match[0].length)
  const next = paragraph?.children?.[1]
  if (rest === '' && next && next.type !== 'break') {
    return null
  }
  const marker = match[1].toLowerCase()
  return MARKDOWN_GITHUB_ALERT_TYPES.find((type) => type === marker) ?? null
}

function stripMarker(quote: MarkdownAlertNode): void {
  const paragraph = quote.children?.[0]
  const children = paragraph?.children
  const text = children?.[0]
  if (!paragraph || !children || typeof text?.value !== 'string') {
    return
  }
  text.value = text.value.replace(ALERT_MARKER, '')
  if (text.value === '') {
    children.shift()
    // A hard break (trailing spaces or a backslash) can end the marker line.
    if (children[0]?.type === 'break') {
      children.shift()
    }
  }
  if (children.length === 0) {
    quote.children?.shift()
  }
}

function transformAlerts(node: MarkdownAlertNode): void {
  for (const child of node.children ?? []) {
    transformAlerts(child)
  }
  if (node.type !== 'blockquote') {
    return
  }
  const type = readAlertType(node)
  if (!type) {
    return
  }
  stripMarker(node)
  node.data = {
    ...node.data,
    hName: 'div',
    hProperties: { className: ['markdown-alert', `markdown-alert-${type}`] }
  }
  node.children = [
    {
      type: 'paragraph',
      data: { hProperties: { className: ['markdown-alert-title'] } },
      children: [{ type: 'text', value: ALERT_TITLES[type] }]
    },
    ...(node.children ?? [])
  ]
}

export function remarkGithubAlerts() {
  return (tree: MarkdownAlertNode): void => {
    transformAlerts(tree)
  }
}
