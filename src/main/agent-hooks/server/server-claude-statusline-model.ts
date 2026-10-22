// Fork: the statusline wrapper's model/effort posts for the pane badge
// (claude-statusline-model-badge.ts). One listener per process, like the server itself.
import type { ServerResponse } from 'node:http'
import {
  CLAUDE_STATUSLINE_MODEL_PATHNAME,
  parseClaudeStatusLineModelBody,
  type ClaudeStatusLineModelReport
} from '../../../shared/claude-statusline-model-badge'

let listener: ((report: ClaudeStatusLineModelReport) => void) | null = null

export function setClaudeStatusLineModelListener(
  next: ((report: ClaudeStatusLineModelReport) => void) | null
): void {
  listener = next
}

/** Answers the wrapper's post; false when the request is not this route. */
export function handleClaudeStatusLineModelRequest(
  pathname: string,
  body: unknown,
  res: ServerResponse
): boolean {
  if (pathname !== CLAUDE_STATUSLINE_MODEL_PATHNAME) {
    return false
  }
  const report = parseClaudeStatusLineModelBody(body)
  if (report) {
    listener?.(report)
  }
  res.writeHead(204)
  res.end()
  return true
}
