import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Fork version scheme: a build stacks the fork revision on top of the upstream
// base, e.g. 1.4.169-rc.0 → 1.4.169-rc.0.machamy.<rev>.local.<ts>.<commit>. The
// rev lives in the FORK_VERSION file and is bumped per fork milestone (see
// FORK_CHANGELOG.md). `forkRev` is optional so upstream's plain scheme still works.
export function createLocalBuildVersion(baseVersion, timestamp, commit, forkRev) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(baseVersion)) {
    throw new Error(`Package version is not valid semver: ${baseVersion}`)
  }
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error('Local build timestamp is invalid.')
  }
  const sanitizedCommit = commit.replace(/[^0-9A-Za-z-]/g, '').slice(0, 12)
  if (!sanitizedCommit) {
    throw new Error('Git commit identity is empty.')
  }
  const sanitizedForkRev =
    forkRev == null ? '' : String(forkRev).replace(/[^0-9A-Za-z-]/g, '').slice(0, 32)
  const suffix = sanitizedForkRev
    ? `machamy.${sanitizedForkRev}.local.${timestamp}.${sanitizedCommit}`
    : `local.${timestamp}.${sanitizedCommit}`
  return baseVersion.includes('-') ? `${baseVersion}.${suffix}` : `${baseVersion}-${suffix}`
}

function readForkRevision() {
  try {
    const raw = readFileSync(resolve('FORK_VERSION'), 'utf8').trim()
    return raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

export function getLocalBuildIdentity() {
  const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    encoding: 'utf8'
  }).trim()
  return {
    commit,
    version: createLocalBuildVersion(packageJson.version, Date.now(), commit, readForkRevision())
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const identity = getLocalBuildIdentity()
  console.log(`[build:mac] local update version ${identity.version}`)
  execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'electron-builder', '--config', 'config/electron-builder.config.cjs', '--mac'],
    {
      env: {
        ...process.env,
        ORCA_BUILD_COMMIT: identity.commit,
        ORCA_LOCAL_BUILD_VERSION: identity.version
      },
      stdio: 'inherit'
    }
  )
}
