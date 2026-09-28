import { describe, expect, it } from 'vitest'
import { resolveCliCommand } from './codex-cli/command'
import { resolveExternalEditorLaunchSpec } from './external-editor-launch'
import { resolveMacAppBundleEditorCli } from './macos-app-bundle-editor-cli'

const VSCODE_CLI = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'

describe('resolveMacAppBundleEditorCli', () => {
  it('finds the CLI inside an installed app bundle', () => {
    expect(resolveMacAppBundleEditorCli('code', (path) => path === VSCODE_CLI)).toBe(VSCODE_CLI)
  })

  it('also looks in ~/Applications', () => {
    const userCli = '/Users/me/Applications/Cursor.app/Contents/Resources/app/bin/cursor'
    expect(resolveMacAppBundleEditorCli('cursor', (path) => path === userCli, '/Users/me')).toBe(
      userCli
    )
  })

  it('returns null when the app is missing or the command is unknown', () => {
    expect(resolveMacAppBundleEditorCli('code', () => false)).toBeNull()
    expect(resolveMacAppBundleEditorCli('idea', () => true)).toBeNull()
  })
})

describe('Open in VS Code without the `code` shell command', () => {
  // Only meaningful where `code` is not on PATH (the case this fixes).
  const codeOnPath = resolveCliCommand('code', { platform: 'darwin' }) !== 'code'

  it.skipIf(codeOnPath)('launches the bundled CLI on macOS', () => {
    const spec = resolveExternalEditorLaunchSpec('code', '/work/repo', {
      platform: 'darwin',
      fileExists: (path) => path === VSCODE_CLI
    })
    expect(spec).toMatchObject({
      kind: 'executable',
      spawnCmd: VSCODE_CLI,
      spawnArgs: ['/work/repo']
    })
  })

  it.skipIf(codeOnPath)('keeps the bare command when the app is not installed either', () => {
    const spec = resolveExternalEditorLaunchSpec('code', '/work/repo', {
      platform: 'darwin',
      fileExists: () => false
    })
    expect(spec).toMatchObject({ spawnCmd: 'code' })
  })
})
