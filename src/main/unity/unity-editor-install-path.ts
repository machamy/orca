import { homedir } from 'node:os'
import { join } from 'node:path'

/** Hub's default install layout on each platform; nothing else is probed —
 *  a custom install location falls back to opening Unity Hub. */
export function unityEditorBinaryPath(
  version: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === 'darwin') {
    return `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`
  }
  if (platform === 'win32') {
    return join(
      process.env.ProgramFiles ?? 'C:\\Program Files',
      'Unity',
      'Hub',
      'Editor',
      version,
      'Editor',
      'Unity.exe'
    )
  }
  return join(homedir(), 'Unity', 'Hub', 'Editor', version, 'Editor', 'Unity')
}
