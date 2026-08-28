import { spawn } from 'node:child_process'

export type EditorLaunchResult = { ok: true } | { ok: false; detail: string }

export type EditorLauncher = (binary: string, argv: string[]) => Promise<EditorLaunchResult>

/**
 * Start an external editor detached, so the app's lifetime never owns Unity's
 * or Rider's — but WAIT for the spawn to take (or fail). A fire-and-forget
 * launch returned {opened:true} and then threw an unhandled 'error' in main
 * when the binary lost its exec bit between the existsSync and the spawn.
 */
export function launchDetachedEditor(binary: string, argv: string[]): Promise<EditorLaunchResult> {
  return new Promise((resolve) => {
    const child = spawn(binary, argv, { detached: true, stdio: 'ignore' })
    child.once('spawn', () => {
      child.unref()
      resolve({ ok: true })
    })
    child.once('error', (error) => {
      resolve({ ok: false, detail: error instanceof Error ? error.message : String(error) })
    })
  })
}
