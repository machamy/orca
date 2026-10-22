import { defineConfig } from 'vitest/config'
import baseConfig from './vitest.config'
import { FORK_CONTRACT_TESTS } from './fork-contract-tests.mjs'

/**
 * The fork-contract gate: runs exactly the files in `fork-contract-tests.mjs`.
 * Fast enough to run after every upstream merge BEFORE the full suite — a red
 * here means a fork feature (or upstream behavior the fork re-touched) broke.
 *
 * Built by spreading the base config rather than mergeConfig: mergeConfig
 * CONCATENATES `include` arrays, which silently turns this gate back into the
 * full suite.
 *
 * Why the projects override: the base config runs per-runtime projects that each
 * carry their own `include`, so a top-level include alone still ran every suite.
 */
const nodeProjects = (baseConfig.test?.projects ?? []).flatMap((project) =>
  typeof project === 'object' &&
  project !== null &&
  'test' in project &&
  project.test?.name === 'node'
    ? [{ ...project, test: { ...project.test, include: FORK_CONTRACT_TESTS } }]
    : []
)

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: FORK_CONTRACT_TESTS,
    projects: nodeProjects
  }
})
