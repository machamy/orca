import { homedir } from 'node:os'
import { join } from 'node:path'

// Fork: macOS editors ship their CLI inside the app bundle, and many users never run
// "Shell Command: Install 'code' command in PATH" — so a bare `code` resolves nowhere and
// "Open in VS Code" fails although the app is installed. Used only when PATH has no match.
const BUNDLED_CLI_PATHS: Readonly<Record<string, readonly string[]>> = {
  code: ['Visual Studio Code.app/Contents/Resources/app/bin/code'],
  'code-insiders': ['Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code'],
  cursor: ['Cursor.app/Contents/Resources/app/bin/cursor']
}

export function resolveMacAppBundleEditorCli(
  command: string,
  fileExists: (path: string) => boolean,
  homePath: string = homedir()
): string | null {
  const relativePaths = BUNDLED_CLI_PATHS[command]
  if (!relativePaths) {
    return null
  }
  for (const root of ['/Applications', join(homePath, 'Applications')]) {
    for (const relativePath of relativePaths) {
      const candidate = join(root, relativePath)
      if (fileExists(candidate)) {
        return candidate
      }
    }
  }
  return null
}
