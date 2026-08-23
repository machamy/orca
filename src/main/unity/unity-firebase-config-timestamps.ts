import { readFile, stat, utimes } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Firebase's Unity editor plugin regenerates `google-services-desktop.json`
 * whenever its mtime is not newer than the source config's
 * (GenerateXmlFromGoogleServicesJson.CreateDesktopJsonFromJson compares
 * File.GetLastWriteTime). Fresh git checkouts write both files in the same
 * burst, leaving the comparison on a knife's edge — and when the plugin does
 * regenerate, it runs AssetDatabase.CopyAsset inside the first-open import
 * storm, where the Temp-staged move can fail and Unity 6000.3.16f1 then
 * crashes in its own retry-dialog logging (observed twice on seeded
 * worktrees; the second open always succeeded because the editor was quiet).
 *
 * When the generated file already holds exactly the source's bytes, bumping
 * its mtime clearly PAST the source makes every gate read "up to date" and
 * the doomed copy never starts. Content differs → leave it alone: that is a
 * legitimate regeneration the plugin must perform.
 */

const DESKTOP_OUTPUT_RELPATH = join('Assets', 'StreamingAssets', 'google-services-desktop.json')

/** The two locations the plugin's config search actually reads the source from;
 *  both stat'ed cheaply instead of scanning all of Assets. */
const CONFIG_SOURCE_RELPATHS = [
  join('Assets', 'StreamingAssets', 'google-services.json'),
  join('Assets', 'google-services.json')
]

const OUTPUT_MTIME_MARGIN_MS = 2_000

export async function markFirebaseDesktopJsonUpToDate(projectPath: string): Promise<boolean> {
  const outputPath = join(projectPath, DESKTOP_OUTPUT_RELPATH)
  let output: { bytes: Buffer; mtimeMs: number }
  try {
    const [bytes, stats] = await Promise.all([readFile(outputPath), stat(outputPath)])
    output = { bytes, mtimeMs: stats.mtimeMs }
  } catch {
    // No generated file: the plugin's first generation is legitimate.
    return false
  }
  let newestMatchingSourceMtimeMs: number | null = null
  for (const relpath of CONFIG_SOURCE_RELPATHS) {
    const sourcePath = join(projectPath, relpath)
    try {
      const [bytes, stats] = await Promise.all([readFile(sourcePath), stat(sourcePath)])
      if (!bytes.equals(output.bytes)) {
        // The plugin would (rightly) regenerate from this source; don't mask it.
        return false
      }
      newestMatchingSourceMtimeMs = Math.max(newestMatchingSourceMtimeMs ?? 0, stats.mtimeMs)
    } catch {
      // Absent candidate — fine.
    }
  }
  if (newestMatchingSourceMtimeMs === null) {
    return false
  }
  const target = newestMatchingSourceMtimeMs + OUTPUT_MTIME_MARGIN_MS
  if (output.mtimeMs >= target) {
    return false
  }
  try {
    const stamp = new Date(target)
    await utimes(outputPath, stamp, stamp)
    return true
  } catch {
    return false
  }
}
