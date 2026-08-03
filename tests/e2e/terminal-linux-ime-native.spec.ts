import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Page, TestInfo } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  focusActiveTerminalInput,
  sendToTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'
import {
  attachTerminalImeBoundaryEvidence,
  disposeTerminalImeBoundaryProbe,
  installTerminalImeBoundaryProbe,
  readTerminalImeBoundaryTrace
} from './terminal-ime-boundary-probe'
import {
  createTerminalImeByteReader,
  removeTerminalImeByteReader,
  startTerminalImeByteReader,
  waitForTerminalImeBytes
} from './terminal-ime-byte-reader'

const DEFAULT_REPETITIONS = 5
const MAX_REPETITIONS = 30
const DEFAULT_KEY_DELAY_MS = 20
const MAX_KEY_DELAY_MS = 100
const NATIVE_COMMAND_TIMEOUT_MS = 10_000
const inputFramework = process.env.ORCA_E2E_NATIVE_IME ?? 'ibus'
const isFcitx = inputFramework === 'fcitx5'

test.use({
  orcaAppExtraEnv: {
    GTK_IM_MODULE: isFcitx ? 'fcitx' : 'ibus',
    ...(isFcitx ? {} : { IBUS_ENABLE_SYNC_MODE: '1' }),
    QT_IM_MODULE: isFcitx ? 'fcitx' : 'ibus',
    XMODIFIERS: isFcitx ? '@im=fcitx' : '@im=ibus'
  }
})

function nativeRepetitions(): number {
  const parsed = Number(process.env.ORCA_E2E_NATIVE_IME_REPETITIONS ?? DEFAULT_REPETITIONS)
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_REPETITIONS)
    : DEFAULT_REPETITIONS
}

function nativeKeyDelayMs(): number {
  const parsed = Number(process.env.ORCA_E2E_NATIVE_IME_KEY_DELAY_MS ?? DEFAULT_KEY_DELAY_MS)
  return Number.isInteger(parsed) && parsed >= 0
    ? Math.min(parsed, MAX_KEY_DELAY_MS)
    : DEFAULT_KEY_DELAY_MS
}

function runXdotool(...args: string[]): void {
  execFileSync('xdotool', args, { stdio: 'pipe', timeout: NATIVE_COMMAND_TIMEOUT_MS })
}

async function selectInputMethod(engine: string): Promise<void> {
  if (isFcitx) {
    const fcitxEngine = engine === 'libpinyin' ? 'pinyin' : engine
    execFileSync('fcitx5-remote', ['-s', fcitxEngine], {
      stdio: 'pipe',
      timeout: NATIVE_COMMAND_TIMEOUT_MS
    })
    execFileSync('fcitx5-remote', ['-o'], {
      stdio: 'pipe',
      timeout: NATIVE_COMMAND_TIMEOUT_MS
    })
    await expect
      .poll(
        () =>
          execFileSync('fcitx5-remote', [], {
            encoding: 'utf8',
            timeout: NATIVE_COMMAND_TIMEOUT_MS
          }).trim(),
        { timeout: 20_000 }
      )
      .toBe('2')
    return
  }

  const request = spawn('ibus', ['engine', engine], { stdio: 'ignore' })
  try {
    await expect
      .poll(
        () =>
          execFileSync('ibus', ['engine'], {
            encoding: 'utf8',
            timeout: NATIVE_COMMAND_TIMEOUT_MS
          }).trim(),
        { timeout: 20_000 }
      )
      .toBe(engine)
  } finally {
    if (request.exitCode === null) {
      request.kill()
    }
  }
}

async function selectOrdinaryInput(): Promise<void> {
  if (!isFcitx) {
    await selectInputMethod('xkb:us::eng')
    return
  }
  execFileSync('fcitx5-remote', ['-c'], {
    stdio: 'pipe',
    timeout: NATIVE_COMMAND_TIMEOUT_MS
  })
  await expect
    .poll(
      () =>
        execFileSync('fcitx5-remote', [], {
          encoding: 'utf8',
          timeout: NATIVE_COMMAND_TIMEOUT_MS
        }).trim(),
      { timeout: 20_000 }
    )
    .not.toBe('2')
}

async function focusNativeTerminalWindow(page: Page, engine: string): Promise<string> {
  await focusActiveTerminalInput(page)
  const title = `ORCA_NATIVE_IME_${randomUUID()}`
  await page.evaluate((nextTitle) => {
    document.title = nextTitle
  }, title)
  await expect.poll(() => page.title(), { timeout: 5_000 }).toBe(title)

  runXdotool('search', '--onlyvisible', '--name', title, 'windowfocus', '--sync')
  await selectInputMethod(engine)
  return title
}

function typeExactByteSequence(repetitions: number): void {
  const delay = String(nativeKeyDelayMs())
  for (let index = 0; index < repetitions; index += 1) {
    runXdotool('type', '--delay', delay, '--clearmodifiers', 'gks')
    runXdotool('key', 'Hangul')
    runXdotool('type', '--delay', delay, 'abc')
    runXdotool('key', 'Hangul')
    runXdotool('type', '--delay', delay, 'rmf')
    runXdotool('key', 'Return')
  }
}

function typeSentenceSequence(repetitions: number): void {
  const delaySeconds = String(nativeKeyDelayMs() / 1_000)
  for (let index = 0; index < repetitions; index += 1) {
    for (const key of 'xptmxmfmf gkrh dlTsmsep duwjsgl rmfjsp') {
      runXdotool('type', '--clearmodifiers', key)
      runXdotool('sleep', delaySeconds)
    }
    runXdotool('key', 'Return')
  }
}

async function typeNumericCandidateSequence(repetitions: number): Promise<void> {
  const delay = String(nativeKeyDelayMs())
  for (let index = 0; index < repetitions; index += 1) {
    runXdotool('type', '--delay', delay, '--clearmodifiers', 'zhong')
    runXdotool('sleep', '0.2')
    runXdotool('key', '1')
    runXdotool('key', 'Return')
  }
  await selectOrdinaryInput()
  for (let index = 0; index < repetitions; index += 1) {
    runXdotool('type', '--delay', delay, '--clearmodifiers', '1')
    runXdotool('key', 'Return')
  }
}

async function runNativeImeScenario(
  page: Page,
  testInfo: TestInfo,
  testRepoPath: string,
  engine: string,
  expectedLines: string[],
  expectedCommit: RegExp,
  driveInput: (repetitions: number) => void | Promise<void>
): Promise<void> {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await waitForActiveTerminalManager(page, 30_000)

  const repetitions = nativeRepetitions()
  const ptyId = await waitForActivePanePtyId(page)
  const reader = createTerminalImeByteReader(testRepoPath, expectedLines.length)
  let completed = false
  let receivedBytes: string[] = []
  try {
    await startTerminalImeByteReader(page, ptyId, reader)
    await focusNativeTerminalWindow(page, engine)
    await installTerminalImeBoundaryProbe(page)
    await driveInput(repetitions)

    receivedBytes = await waitForTerminalImeBytes(page, reader, 30_000)
    const trace = await readTerminalImeBoundaryTrace(page)
    expect(trace.dom.some((event) => event.type === 'compositionstart')).toBe(true)
    expect(
      trace.dom.some(
        (event) =>
          (event.type === 'compositionupdate' ||
            (event.type === 'input' && event.inputType === 'insertText')) &&
          expectedCommit.test(event.data ?? '')
      )
    ).toBe(true)

    const expectedBytes = expectedLines.map((line) => Buffer.from(`${line}\n`).toString('hex'))
    expect(receivedBytes).toEqual(expectedBytes)

    expect(trace.onData.join('')).toBe(expectedLines.map((line) => `${line}\r`).join(''))
    completed = true
  } finally {
    await attachTerminalImeBoundaryEvidence(page, testInfo, `native-${inputFramework}-boundaries`, {
      display: process.env.DISPLAY,
      engine,
      inputFramework,
      expectedLines,
      keyDelayMs: nativeKeyDelayMs(),
      receivedBytes,
      repetitions
    }).catch(() => undefined)
    await disposeTerminalImeBoundaryProbe(page).catch(() => undefined)
    if (!completed) {
      await sendToTerminal(page, ptyId, '\x03').catch(() => undefined)
    }
    removeTerminalImeByteReader(reader)
  }
}

test.describe('Native Linux terminal input @headful', () => {
  test.skip(
    process.env.ORCA_E2E_NATIVE_IME === undefined,
    'Run through config/scripts/run-terminal-linux-ime-e2e.mjs'
  )

  test('forwards the issue exact-byte sequence without loss or duplication', async ({
    orcaPage,
    testRepoPath
  }, testInfo) => {
    const repetitions = nativeRepetitions()
    await runNativeImeScenario(
      orcaPage,
      testInfo,
      testRepoPath,
      'hangul',
      Array.from({ length: repetitions }, () => '한abc글'),
      /[\uac00-\ud7af]/,
      typeExactByteSequence
    )
  })

  test('forwards the issue sentence stress sequence without leaked ASCII', async ({
    orcaPage,
    testRepoPath
  }, testInfo) => {
    const repetitions = nativeRepetitions()
    await runNativeImeScenario(
      orcaPage,
      testInfo,
      testRepoPath,
      'hangul',
      Array.from({ length: repetitions }, () => '테스트를 하고 있는데 여전히 그러네'),
      /[\uac00-\ud7af]/,
      typeSentenceSequence
    )
  })

  test('keeps a numeric Pinyin candidate and ordinary digit exactly once', async ({
    orcaPage,
    testRepoPath
  }, testInfo) => {
    const repetitions = nativeRepetitions()
    await runNativeImeScenario(
      orcaPage,
      testInfo,
      testRepoPath,
      'libpinyin',
      [
        ...Array.from({ length: repetitions }, () => '中'),
        ...Array.from({ length: repetitions }, () => '1')
      ],
      /中/,
      typeNumericCandidateSequence
    )
  })
})
