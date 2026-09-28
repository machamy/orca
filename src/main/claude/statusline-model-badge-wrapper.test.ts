import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CLAUDE_STATUSLINE_MODEL_PATHNAME,
  parseClaudeStatusLineModelBody
} from '../../shared/claude-statusline-model-badge'
import {
  getModelBadgeWrapperCommand,
  getModelBadgeWrapperScript,
  installModelBadgeStatusLineWrapper,
  restoreModelBadgeStatusLine,
  type WrapperPaths
} from './statusline-model-badge-wrapper'

const posixOnly = process.platform === 'win32' ? describe.skip : describe

const PAYLOAD = JSON.stringify({
  session_id: 's',
  cwd: '/work/model-test',
  model: { id: 'claude-opus-5', display_name: 'Opus 5 (1M context)' },
  effort: { level: 'xhigh' },
  output_style: { name: 'default' }
})

type Post = { path: string; token: string | undefined; body: Record<string, string> }

let dir = ''
let server: Server | null = null
let posts: Post[] = []
let port = 0

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'orca-model-badge-'))
  posts = []
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      posts.push({
        path: req.url ?? '',
        token:
          typeof req.headers['x-orca-agent-hook-token'] === 'string'
            ? req.headers['x-orca-agent-hook-token']
            : undefined,
        body: Object.fromEntries(new URLSearchParams(raw))
      })
      res.writeHead(204)
      res.end()
    })
  })
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  port = typeof address === 'object' && address ? address.port : 0
})

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = null
  rmSync(dir, { recursive: true, force: true })
})

function paths(): WrapperPaths {
  return { script: join(dir, 'claude-model-badge-statusline.sh'), inner: join(dir, 'inner') }
}

function runWrapper(payload: string, env: Record<string, string>): Promise<string> {
  const { script, inner } = paths()
  writeFileSync(script, getModelBadgeWrapperScript(inner))
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', [script], {
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', TMPDIR: dir, ...env }
    })
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', reject)
    child.on('close', () => resolve(out))
    child.stdin.end(payload)
  })
}

async function settle(count: number): Promise<void> {
  for (let i = 0; i < 40 && posts.length < count; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  // Give a would-be extra post time to arrive before asserting its absence.
  await new Promise((resolve) => setTimeout(resolve, 150))
}

const orcaEnv = (): Record<string, string> => ({
  ORCA_PANE_KEY: 'tab-1:leaf-1',
  ORCA_AGENT_HOOK_PORT: String(port),
  ORCA_AGENT_HOOK_TOKEN: 'secret-token'
})

posixOnly('model badge statusline wrapper script', () => {
  it('prints exactly what the wrapped command prints', async () => {
    writeFileSync(paths().inner, "cat >/dev/null; printf 'MY STATUS'\n")
    expect(await runWrapper(PAYLOAD, orcaEnv())).toBe('MY STATUS')
  })

  it('hands the wrapped command the original payload on stdin', async () => {
    writeFileSync(paths().inner, 'cat\n')
    expect(await runWrapper(PAYLOAD, {})).toBe(PAYLOAD)
  })

  it('posts the model and effort for its pane, then only when they change', async () => {
    writeFileSync(paths().inner, 'cat >/dev/null\n')
    await runWrapper(PAYLOAD, orcaEnv())
    await settle(1)
    expect(posts).toHaveLength(1)
    expect(posts[0].path).toBe(CLAUDE_STATUSLINE_MODEL_PATHNAME)
    expect(posts[0].token).toBe('secret-token')
    expect(parseClaudeStatusLineModelBody(posts[0].body)).toEqual({
      paneKey: 'tab-1:leaf-1',
      model: 'Opus 5 (1M context)',
      effort: 'xhigh'
    })

    await runWrapper(PAYLOAD, orcaEnv())
    await settle(1)
    expect(posts).toHaveLength(1)

    await runWrapper(PAYLOAD.replace('"xhigh"', '"medium"'), orcaEnv())
    await settle(2)
    expect(posts).toHaveLength(2)
    expect(posts[1].body.effort).toBe('medium')
  })

  it('reads pretty-printed payloads and falls back to the model id', async () => {
    writeFileSync(paths().inner, 'cat >/dev/null\n')
    const pretty = JSON.stringify(
      { model: { id: 'claude-sonnet-5' }, effort: { level: 'high' } },
      null,
      2
    )
    await runWrapper(pretty, orcaEnv())
    await settle(1)
    expect(posts[0].body).toMatchObject({ model: 'claude-sonnet-5', effort: 'high' })
  })

  it('stays silent outside an Orca pane but still prints the status line', async () => {
    writeFileSync(paths().inner, "cat >/dev/null; printf 'plain terminal'\n")
    expect(
      await runWrapper(PAYLOAD, { ORCA_AGENT_HOOK_PORT: String(port), ORCA_AGENT_HOOK_TOKEN: 't' })
    ).toBe('plain terminal')
    await settle(0)
    expect(posts).toHaveLength(0)
  })

  it('does not post from a background job worker that inherited a pane key', async () => {
    writeFileSync(paths().inner, 'cat >/dev/null\n')
    await runWrapper(PAYLOAD, { ...orcaEnv(), CLAUDE_JOB_DIR: dir })
    await settle(0)
    expect(posts).toHaveLength(0)
  })
})

posixOnly('model badge statusline install and restore', () => {
  it('wraps a user status line, keeps its other fields, and restores it exactly', () => {
    const p = paths()
    const config = { statusLine: { type: 'command', command: 'my-status --fancy', padding: 0 } }
    const installed = installModelBadgeStatusLineWrapper(config, undefined, p)
    expect(installed.statusLine).toEqual({
      type: 'command',
      command: getModelBadgeWrapperCommand('my-status --fancy'),
      padding: 0
    })
    expect(readFileSync(p.inner, 'utf8').trim()).toBe('my-status --fancy')
    expect(existsSync(p.script)).toBe(true)

    // Reinstalling on the next start keeps the original, never wraps the wrapper.
    expect(installModelBadgeStatusLineWrapper(installed, undefined, p)).toEqual(installed)

    const restored = restoreModelBadgeStatusLine(installed, undefined, p)
    expect(restored.changed).toBe(true)
    expect(restored.config.statusLine).toEqual(config.statusLine)
    expect(existsSync(p.inner)).toBe(false)
    expect(existsSync(p.script)).toBe(false)
  })

  it('restores from the settings entry itself even if the sidecar is gone', () => {
    const p = paths()
    const installed = installModelBadgeStatusLineWrapper(
      { statusLine: { type: 'command', command: 'my-status' } },
      undefined,
      p
    )
    rmSync(p.inner, { force: true })
    expect(restoreModelBadgeStatusLine(installed, undefined, p).config.statusLine).toEqual({
      type: 'command',
      command: 'my-status'
    })
  })

  it('leaves an empty slot empty, since that is the user opting out', () => {
    expect(installModelBadgeStatusLineWrapper({}, undefined, paths())).toEqual({})
  })

  it('leaves a status line it did not install alone on restore', () => {
    const config = { statusLine: { type: 'command', command: 'someone-else' } }
    expect(restoreModelBadgeStatusLine(config, undefined, paths())).toEqual({
      config,
      changed: false
    })
  })
})

posixOnly('model badge statusline settings command', () => {
  function runSettingsCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('/bin/sh', ['-c', command], {
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: dir, TMPDIR: dir }
      })
      let out = ''
      child.stdout.on('data', (chunk) => {
        out += chunk
      })
      child.on('error', reject)
      child.on('close', () => resolve(out))
      child.stdin.end(PAYLOAD)
    })
  }

  it('runs the original command alone where the wrapper script does not exist', async () => {
    const command = getModelBadgeWrapperCommand("cat >/dev/null; printf 'original'")
    expect(await runSettingsCommand(command)).toBe('original')
  })

  it('runs through the wrapper when Orca installed it', async () => {
    const hooks = join(dir, '.orca', 'agent-hooks')
    mkdirSync(hooks, { recursive: true })
    const p = {
      script: join(hooks, 'claude-model-badge-statusline.sh'),
      inner: join(hooks, 'inner')
    }
    const installed = installModelBadgeStatusLineWrapper(
      { statusLine: { type: 'command', command: "cat >/dev/null; printf 'original'" } },
      undefined,
      p
    )
    // The wrapper announces itself only through its sidecar run, so swap the inner to prove it ran.
    writeFileSync(p.inner, "cat >/dev/null; printf 'via wrapper'\n")
    const slot = installed.statusLine
    const command =
      typeof slot === 'object' &&
      slot !== null &&
      'command' in slot &&
      typeof slot.command === 'string'
        ? slot.command
        : ''
    expect(await runSettingsCommand(command)).toBe('via wrapper')
  })
})
