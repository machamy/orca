const { execFileSync } = require('node:child_process')

/** Common name of a self-signed code-signing certificate in the login keychain.
 *  Override with ORCA_LOCAL_SIGN_IDENTITY. */
const DEFAULT_LOCAL_IDENTITY = 'Orca Local Signing'

/** The identity to seal local builds with, or '-' (ad-hoc) when none is usable.
 *  Why it matters: TCC anchors permission grants on code identity. An ad-hoc
 *  signature has none, so its designated requirement is the build's own cdhash
 *  and every rebuild reads as a different app — the user re-grants file access
 *  on every install. A stable certificate makes the requirement certificate-
 *  based instead, so grants survive rebuilds. */
function resolveLocalSigningIdentity(run = execFileSync, env = process.env) {
  const requested = env.ORCA_LOCAL_SIGN_IDENTITY?.trim()
  const identity = requested && requested.length > 0 ? requested : DEFAULT_LOCAL_IDENTITY
  try {
    const found = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf-8'
    })
    if (typeof found === 'string' && found.includes(identity)) {
      return identity
    }
  } catch {
    /* no keychain access or no identities — fall through to ad-hoc */
  }
  if (requested) {
    // An explicit request that is not installed is a setup mistake, not a
    // silent downgrade: say so, since the whole point is stable permissions.
    console.warn(
      `[sign-local-mac-app] ORCA_LOCAL_SIGN_IDENTITY="${requested}" is not a valid codesigning identity; falling back to ad-hoc (permissions will reset each build).`
    )
  }
  return '-'
}

function signLocalMacApp(appPath, run = execFileSync, env = process.env) {
  // Why: when no Apple development certificate is installed, electron-builder
  // leaves Electron's linker signature on the outer bundle. macOS then sees the
  // requester as `Electron` and rejects notifications for com.stablyai.orca.
  // Seal the completed local bundle after nested helpers have been signed so
  // Info.plist supplies the app's real code-signing identifier.
  const identity = resolveLocalSigningIdentity(run, env)
  run('/usr/bin/codesign', ['--force', '--deep', '--sign', identity, appPath], {
    stdio: 'inherit'
  })
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], {
    stdio: 'inherit'
  })
}

module.exports = { signLocalMacApp, resolveLocalSigningIdentity, DEFAULT_LOCAL_IDENTITY }
