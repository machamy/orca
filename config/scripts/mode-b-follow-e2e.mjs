#!/usr/bin/env node
// Mode-B ("agents follow") default-worktree switch E2E harness (fork tool).
// Drives the REAL running Orca app via the orca CLI, using the same renderer
// flow as the sidebar dialog (worktree default set --follow-agents --ui-flow).
// Each iteration: ensure agents run on the default side -> wait for their hook
// session ids -> switch -> verify branches swapped, tabs moved, agents resumed
// with the SAME session ids -> archive evidence -> switch back.
//
// Usage: node mode-b-e2e.mjs [iterations] [--agents claude,codex]
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { homedir } from 'node:os'

const APP_SUPPORT =
  process.env.ORCA_APP_SUPPORT ?? join(homedir(), 'Library', 'Application Support', 'orca')
const REPO_PATH = process.env.E2E_REPO_PATH ?? join(homedir(), 'orca/projects/local-workspace')
const SUB_PATH =
  process.env.E2E_SUB_PATH ?? join(homedir(), 'orca/workspaces/local-workspace/swaptest')
const TRACE = join(APP_SUPPORT, 'logs', 'main.trace.ndjson')
const LAST_STATUS = join(APP_SUPPORT, 'agent-hooks', 'last-status.json')
const OUT_ROOT = join(process.cwd(), 'mode-b-e2e-runs')
const ITERATIONS = Number(process.argv[2] ?? 3)
const AGENTS = (
  process.argv.includes('--agents')
    ? process.argv[process.argv.indexOf('--agents') + 1]
    : 'claude,codex'
).split(',')

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args)
const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout ?? 60_000, ...opts })
const ORCA_BIN = process.env.ORCA_BIN ?? 'orca'
const orca = (args, opts) => JSON.parse(sh(ORCA_BIN, [...args, '--json'], opts))
const orcaRaw = (args, opts) => sh(ORCA_BIN, args, opts)
const git = (cwd, args) => sh('git', ['-C', cwd, ...args]).trim()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// execFileSync hides the interesting part (a CLI error code such as
// agent_prompt_blocked) in stdout/stderr, not in `message`.
function describeExecError(error) {
  const parts = [
    error?.message,
    String(error?.stderr ?? '').trim(),
    String(error?.stdout ?? '').trim()
  ]
  return parts.filter(Boolean).join(' | ').replace(/\s+/g, ' ').slice(0, 400)
}

function branches() {
  return {
    repo: git(REPO_PATH, ['branch', '--show-current']),
    sub: git(SUB_PATH, ['branch', '--show-current'])
  }
}

function lastStatus() {
  return JSON.parse(readFileSync(LAST_STATUS, 'utf8'))
}

// agent -> the tab THIS run drives. Every hook lookup keys off these ids: the
// agent source is not unique (any other long-lived claude pane emits hooks with
// source "claude"), so a source-keyed lookup can answer with a bystander.
function trackedTabIds(tracked) {
  return new Map(
    AGENTS.map((agent) => [agent, String(tracked[agent] ?? '')]).filter(([, tabId]) => tabId !== '')
  )
}

// agent -> newest hook row emitted by that agent's TRACKED tab since `sinceMs`.
function hookEntriesByTrackedTab(tracked, sinceMs, expectedWorktreePath) {
  const agentByTab = new Map([...trackedTabIds(tracked)].map(([agent, tabId]) => [tabId, agent]))
  const picked = new Map()
  for (const entry of Object.values(lastStatus().entries ?? {})) {
    const agent = agentByTab.get(String(entry.tabId ?? ''))
    if (!agent || (entry.receivedAt ?? 0) <= sinceMs || !entry.providerSession?.id) {
      continue
    }
    if (!String(entry.worktreeId ?? '').endsWith(expectedWorktreePath)) {
      continue
    }
    const seen = picked.get(agent)
    if (!seen || (entry.receivedAt ?? 0) > (seen.receivedAt ?? 0)) {
      picked.set(agent, entry)
    }
  }
  return picked
}

function listTerminals() {
  const parsed = orca(['terminal', 'list'])
  return parsed.result?.terminals ?? parsed.terminals ?? []
}

const STATE_FILE = join(process.cwd(), 'mode-b-e2e-state.json')
function loadTrackedTabs() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}
function saveTrackedTabs(tabs) {
  writeFileSync(STATE_FILE, JSON.stringify(tabs, null, 2))
}

// Ledger of every tab this harness created, so cleanup has certain provenance
// even after an id is dropped from the agent -> tab map. Never an agent key.
const CREATED_TABS_KEY = 'createdTabIds'
function createdTabLedger(tracked) {
  return Array.isArray(tracked[CREATED_TABS_KEY]) ? tracked[CREATED_TABS_KEY].map(String) : []
}

function handleForTab(tabId) {
  if (!tabId) {
    return null
  }
  const found = listTerminals().find((t) => t.tabId === tabId)
  return found?.handle ?? null
}

// Close panes THIS harness created and no longer drives. A dead terminal can
// leave its tab open, and the harness used to just overwrite the id — which is
// how three E2E-CLAUDE panes piled up in the default worktree. Provenance must
// be certain before closing: either an id in our own created-tab ledger, or our
// own E2E-<AGENT> title. `keepTabId` is the pane that must survive.
function closeStaleHarnessTabs(agent, tracked, keepTabId) {
  const ours = new Set(createdTabLedger(tracked))
  const keep = new Set(
    [...trackedTabIds(tracked)].filter(([other]) => other !== agent).map(([, tabId]) => tabId)
  )
  if (keepTabId) {
    keep.add(String(keepTabId))
  }
  const ourTitle = `E2E-${agent.toUpperCase()}`
  let terminals = []
  try {
    terminals = listTerminals()
  } catch (error) {
    log(`  terminal list failed during ${agent} tab cleanup: ${describeExecError(error)}`)
    return
  }
  const doomed = terminals.filter((terminal) => {
    const tabId = String(terminal.tabId ?? '')
    if (!tabId || keep.has(tabId)) {
      return false
    }
    return ours.has(tabId) || String(terminal.title ?? '') === ourTitle
  })
  const closed = []
  for (const terminal of doomed) {
    try {
      orca(['terminal', 'close', '--terminal', terminal.handle, '--tab'])
      closed.push(String(terminal.tabId))
      log(`  closed stale ${agent} tab ${String(terminal.tabId).slice(0, 8)} (${terminal.title})`)
    } catch (error) {
      log(
        `  could not close stale ${agent} tab ${String(terminal.tabId).slice(0, 8)}: ${describeExecError(error)}`
      )
    }
  }
  if (closed.length > 0) {
    const survivors = createdTabLedger(tracked).filter((tabId) => !closed.includes(tabId))
    tracked[CREATED_TABS_KEY] = survivors.slice(-20)
    saveTrackedTabs(tracked)
  }
}

async function ensureAgent(agent, worktreeSelector, tracked) {
  // Reuse the tracked tab when its terminal is still alive; otherwise create.
  const liveHandle = handleForTab(tracked[agent])
  closeStaleHarnessTabs(agent, tracked, liveHandle ? tracked[agent] : null)
  if (liveHandle) {
    log(
      `  reusing ${agent} tab ${String(tracked[agent]).slice(0, 8)} -> ${liveHandle.slice(0, 18)}`
    )
    return liveHandle
  }
  const created = orca([
    'terminal',
    'create',
    '--worktree',
    worktreeSelector,
    '--title',
    `E2E-${agent.toUpperCase()}`,
    '--command',
    agent
  ])
  const payload = created.result?.terminal ?? created.result ?? created
  const tabId = payload.tabId ?? payload.id
  tracked[agent] = tabId
  tracked[CREATED_TABS_KEY] = [...new Set([...createdTabLedger(tracked), String(tabId)])].slice(-20)
  saveTrackedTabs(tracked)
  log(`  spawned ${agent} tab ${String(tabId).slice(0, 8)}`)
  await sleep(15_000)
  return handleForTab(tabId)
}

// Satisfied only by the tracked tabs: an unrelated pane can neither complete the
// count nor starve it.
async function waitForFreshHooks(sinceMs, expectedWorktreePath, tracked, timeoutMs = 120_000) {
  const wanted = trackedTabIds(tracked)
  // Without this an empty/partial tracking map would make the wait pass on zero hooks.
  if (wanted.size !== AGENTS.length) {
    throw new Error(`no tab tracked for: ${AGENTS.filter((a) => !wanted.has(a)).join(', ')}`)
  }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const fresh = hookEntriesByTrackedTab(tracked, sinceMs, expectedWorktreePath)
    if (fresh.size >= wanted.size) {
      return fresh
    }
    await sleep(3000)
  }
  return null
}

function traceTail(sinceMs) {
  const lines = readFileSync(TRACE, 'utf8').split('\n')
  const picked = []
  for (const line of lines) {
    if (!line.includes('breadcrumb.name')) {
      continue
    }
    if (!/mode_b|sleeping_record_delete|worktree_purge/.test(line)) {
      continue
    }
    try {
      const obj = JSON.parse(line)
      const ts = Number(obj.startTimeUnixNano) / 1e6
      if (ts > sinceMs) {
        picked.push(line)
      }
    } catch {
      /* skip */
    }
  }
  return picked.join('\n')
}

function readTab(tabId) {
  if (!tabId) {
    return '(no tab tracked for this agent)'
  }
  const handle = handleForTab(tabId)
  if (!handle) {
    return `(no live terminal for tab ${String(tabId).slice(0, 8)})`
  }
  try {
    return orcaRaw(['terminal', 'read', '--terminal', handle])
  } catch (error) {
    return `(read failed: ${describeExecError(error)})`
  }
}

function archiveTabScreens(dir, label, tracked) {
  for (const agent of AGENTS) {
    writeFileSync(join(dir, `screen-${label}-${agent}.txt`), readTab(tracked[agent]))
  }
}

// Throws: a blocked prompt (agent_prompt_blocked) used to be swallowed here and
// resurfaced 120s later as the unrelated "pre-switch hooks missing".
function sendToTab(tabId, text) {
  const handle = handleForTab(tabId)
  if (!handle) {
    throw new Error(`no live terminal for tab ${String(tabId).slice(0, 8)} — cannot send prompt`)
  }
  try {
    orcaRaw(['terminal', 'send', '--terminal', handle, '--text', text, '--enter'])
  } catch (error) {
    throw new Error(`terminal send failed on ${handle.slice(0, 18)}: ${describeExecError(error)}`)
  }
}

// Every abort before the switch archives the same evidence the post-switch path
// does — the offending pane's screen included.
function failBeforeSwitch(dir, iter, tracked, reason) {
  archiveTabScreens(dir, 'pre-switch-failure', tracked)
  writeFileSync(join(dir, 'FAIL.txt'), reason)
  writeFileSync(join(dir, 'last-status-fail.json'), JSON.stringify(lastStatus(), null, 2))
  writeFileSync(join(dir, 'tracked-tabs-fail.json'), JSON.stringify(tracked, null, 2))
  try {
    writeFileSync(join(dir, 'terminal-list-fail.txt'), orcaRaw(['terminal', 'list']))
  } catch (error) {
    writeFileSync(join(dir, 'terminal-list-fail.txt'), describeExecError(error))
  }
  return new Error(`iter ${iter}: ${reason}`)
}

async function runIteration(iter) {
  const dir = join(OUT_ROOT, `iter-${String(iter).padStart(2, '0')}-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  const startedMs = Date.now()
  const tracked = loadTrackedTabs()
  const before = branches()
  log(`[iter ${iter}] branches before: repo=${before.repo} sub=${before.sub}`)
  writeFileSync(join(dir, 'branches-before.json'), JSON.stringify(before, null, 2))

  // 1. Make sure each agent runs on the CURRENT DEFAULT side and has a session id.
  const defaultSelector = `path:${REPO_PATH}`
  for (const agent of AGENTS) {
    await ensureAgent(agent, defaultSelector, tracked)
  }
  await sleep(5_000)
  const untracked = AGENTS.filter((agent) => !tracked[agent])
  if (untracked.length > 0) {
    throw failBeforeSwitch(dir, iter, tracked, `no tab tracked for: ${untracked.join(', ')}`)
  }
  log(`  tracked tabs: ${JSON.stringify(Object.fromEntries(trackedTabIds(tracked)))}`)
  for (const agent of AGENTS) {
    try {
      sendToTab(tracked[agent], 'Reply with exactly: ready')
    } catch (error) {
      throw failBeforeSwitch(dir, iter, tracked, `${agent} prompt send failed: ${error.message}`)
    }
  }
  log('  waiting for hook session ids on the default side...')
  const preHooks = await waitForFreshHooks(startedMs, REPO_PATH, tracked)
  writeFileSync(join(dir, 'last-status-pre.json'), JSON.stringify(lastStatus(), null, 2))
  if (!preHooks) {
    throw failBeforeSwitch(
      dir,
      iter,
      tracked,
      'pre-switch hooks never arrived from the tracked tabs of all agents'
    )
  }
  const preSessions = Object.fromEntries(
    [...preHooks].map(([agent, entry]) => [agent, entry.providerSession.id])
  )
  log(`  pre-switch sessions: ${JSON.stringify(preSessions)}`)

  // 2. Switch: promote the sub-worktree via the UI flow.
  const switchAtMs = Date.now()
  const switchOut = orca(
    [
      'worktree',
      'default',
      'set',
      '--worktree',
      `path:${SUB_PATH}`,
      '--follow-agents',
      '--ui-flow'
    ],
    { timeout: 30_000 }
  )
  writeFileSync(join(dir, 'switch-request.json'), JSON.stringify(switchOut, null, 2))

  // 3. Wait for the swap to land (branches swap) then for resumed agents.
  const deadline = Date.now() + 60_000
  let after = branches()
  while (Date.now() < deadline) {
    after = branches()
    if (after.repo === before.sub && after.sub === before.repo) {
      break
    }
    await sleep(2000)
  }
  writeFileSync(join(dir, 'branches-after.json'), JSON.stringify(after, null, 2))
  const swapped = after.repo === before.sub && after.sub === before.repo
  log(`  branches after: repo=${after.repo} sub=${after.sub} swapped=${swapped}`)

  // Sidebar-visibility proxy: main's mirrored status rows must re-attribute to
  // the swapped side IMMEDIATELY (pre-hook) so chips don't wait on the agent.
  await sleep(3000)
  const ourTabIds = new Set(trackedTabIds(tracked).values())
  const mirrorRows = Object.values(lastStatus().entries ?? {}).filter((entry) =>
    ourTabIds.has(String(entry.tabId ?? ''))
  )
  const mirrorAttributionMoved =
    mirrorRows.length > 0 &&
    mirrorRows.every((entry) => String(entry.worktreeId ?? '').endsWith(SUB_PATH))
  writeFileSync(
    join(dir, 'mirror-attribution.json'),
    JSON.stringify(
      mirrorRows.map((row) => ({
        source: row.source,
        tabId: row.tabId,
        worktreeId: row.worktreeId
      })),
      null,
      2
    )
  )
  log(`  mirror attribution moved (pre-hook): ${mirrorAttributionMoved}`)

  // Agents followed to the SUB path (their branch moved there... no — the agents
  // were on the DEFAULT side; follow means their content moves to where their
  // branch went: the sub-worktree).
  log('  waiting for resumed agents to report hooks from the sub side...')
  await sleep(20_000)
  archiveTabScreens(dir, 'post-switch-20s', tracked)
  let resumedHooks = await waitForFreshHooks(switchAtMs, SUB_PATH, tracked, 40_000)
  if (!resumedHooks) {
    archiveTabScreens(dir, 'pre-nudge', tracked)
    // A resumed TUI may sit idle without emitting a hook; nudge with a prompt.
    log('  nudging resumed agents with a prompt...')
    for (const agent of AGENTS) {
      try {
        sendToTab(tracked[agent], 'Reply with exactly: back')
      } catch (error) {
        log(`  ${agent} nudge failed: ${error.message}`)
      }
    }
    resumedHooks = await waitForFreshHooks(switchAtMs, SUB_PATH, tracked, 150_000)
  }
  archiveTabScreens(dir, 'pre-verdict', tracked)
  await sleep(5_000)
  const postByAgent = hookEntriesByTrackedTab(tracked, switchAtMs, SUB_PATH)
  writeFileSync(join(dir, 'last-status-post.json'), JSON.stringify(lastStatus(), null, 2))
  writeFileSync(join(dir, 'trace-slice.ndjson'), traceTail(startedMs))
  writeFileSync(join(dir, 'terminal-list-post.txt'), orcaRaw(['terminal', 'list']))

  // 4. Verify: same provider session ids continue on the sub side. Keyed by the
  // tracked TAB — a source-keyed lookup let a bystander claude pane that also
  // followed the switch answer for ours, and report a bogus session mismatch.
  const verdict = { swapped, mirrorAttributionMoved, agents: {} }
  for (const agent of AGENTS) {
    const resumed = postByAgent.get(agent)
    verdict.agents[agent] = {
      tabId: tracked[agent],
      resumedHookArrived: Boolean(resumed),
      sessionPreserved: resumed ? resumed.providerSession?.id === preSessions[agent] : false,
      session: resumed?.providerSession?.id ?? null,
      expected: preSessions[agent]
    }
  }
  writeFileSync(join(dir, 'verdict.json'), JSON.stringify(verdict, null, 2))
  log(`  verdict: ${JSON.stringify(verdict)}`)

  // 5. Switch back for the next iteration (promote the now-demoted branch again).
  orca(
    [
      'worktree',
      'default',
      'set',
      '--worktree',
      `path:${SUB_PATH}`,
      '--follow-agents',
      '--ui-flow'
    ],
    { timeout: 30_000 }
  )
  await sleep(25_000)
  const restored = branches()
  writeFileSync(join(dir, 'branches-restored.json'), JSON.stringify(restored, null, 2))
  log(`  restored: repo=${restored.repo} sub=${restored.sub}`)

  if (!swapped) {
    throw new Error(`iter ${iter}: branches did not swap`)
  }
  for (const agent of AGENTS) {
    if (!verdict.agents[agent].resumedHookArrived) {
      throw new Error(`iter ${iter}: ${agent} never reported a hook after the switch`)
    }
    if (!verdict.agents[agent].sessionPreserved) {
      throw new Error(`iter ${iter}: ${agent} resumed with a DIFFERENT session`)
    }
  }
  log(`[iter ${iter}] PASS`)
}

mkdirSync(OUT_ROOT, { recursive: true })
let failures = 0
for (let iter = 1; iter <= ITERATIONS; iter += 1) {
  try {
    await runIteration(iter)
  } catch (error) {
    failures += 1
    log(`[iter ${iter}] FAIL: ${error.message}`)
    break
  }
}
log(
  failures === 0
    ? `ALL ${ITERATIONS} ITERATIONS PASSED`
    : `${failures} failure(s) — evidence in ${OUT_ROOT}`
)
process.exit(failures === 0 ? 0 : 1)
