const { readFileSync } = require('node:fs')
const { join } = require('node:path')

/**
 * Fork: whatever a developer hides from git in `.git/info/exclude` is local
 * workspace — agent worktrees, cloned side repos, scratch output — and never a
 * build input. electron-builder does not read git's ignore rules, so without this
 * it packs all of it into app.asar (106 files of a side repo in a 2026-09-25
 * build). Reading the exclude file keeps those names out of tracked config.
 *
 * Only top-level literal entries (`/name/`, `/name`, `name/`) are taken; globs and
 * negations are skipped rather than guessed at.
 */

// Build inputs that must survive even if someone lists them locally.
const NEVER_EXCLUDED = new Set(['out', 'node_modules', 'resources', 'package.json'])

function localGitExcludePackagingPatterns(repoRoot) {
  let content
  try {
    content = readFileSync(join(repoRoot, '.git', 'info', 'exclude'), 'utf8')
  } catch {
    return []
  }
  const names = new Set()
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('!') || /[*?[\]]/.test(line)) {
      continue
    }
    const name = line.replace(/^\/+/, '').replace(/\/+$/, '')
    // Nested paths are not top-level workspace; leave them to the explicit list.
    if (!name || name.includes('/') || NEVER_EXCLUDED.has(name)) {
      continue
    }
    names.add(name)
  }
  return [...names].map((name) => `!${name}{,/**/*}`)
}

module.exports = { localGitExcludePackagingPatterns }
