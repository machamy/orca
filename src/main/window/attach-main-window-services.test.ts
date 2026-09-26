import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', async () =>
  (await import('./attach-main-window-services-test-harness')).electronModuleMock()
)
vi.mock('../ipc/repos', async () =>
  (await import('./attach-main-window-services-test-harness')).reposModuleMock()
)
vi.mock('../ipc/repos/repos-changed-notification', async () =>
  (await import('./attach-main-window-services-test-harness')).reposChangedNotificationMock()
)
vi.mock('../ipc/watched-worktree-catalog-notification', async () =>
  (await import('./attach-main-window-services-test-harness')).worktreeCatalogNotificationMock()
)
vi.mock('../ipc/worktrees', async () =>
  (await import('./attach-main-window-services-test-harness')).worktreesModuleMock()
)
vi.mock('../ipc/worktree-change-invalidators', async () =>
  (await import('./attach-main-window-services-test-harness')).worktreeChangeInvalidatorsMock()
)
vi.mock('../ipc/pty', async () =>
  (await import('./attach-main-window-services-test-harness')).ptyModuleMock()
)
vi.mock('../memory/hydrate-local-pty-registry', async () =>
  (await import('./attach-main-window-services-test-harness')).hydrateLocalPtyRegistryModuleMock()
)
vi.mock('../ipc/worktree-base-directory-watcher', async () =>
  (await import('./attach-main-window-services-test-harness')).worktreeBaseDirectoryWatcherMock()
)
vi.mock('../browser/browser-manager', async () =>
  (await import('./attach-main-window-services-test-harness')).browserManagerModuleMock()
)
vi.mock('../updater', async () =>
  (await import('./attach-main-window-services-test-harness')).updaterModuleMock()
)
vi.mock('../macos-tcc-prompt-notice', async () =>
  (await import('./attach-main-window-services-test-harness')).macosTccPromptNoticeMock()
)

import { attachMainWindowServices } from './attach-main-window-services'
import {
  browserManagerUnregisterAllMock,
  createMainWindow,
  createRuntime,
  createStore,
  deferred,
  fireReadyToShow,
  getClosedHandlers,
  handleMock,
  hydrateLocalPtyRegistryAtBootMock,
  onMock,
  removeAllListenersMock,
  removeHandlerMock,
  removeListenerMock,
  runWorktreeChangeInvalidatorsMock,
  scheduleWorktreeBaseDirectoryWatcherSyncMock,
  setPermissionRequestHandlerMock,
  setRepoRemoteClientNotifierMock,
  setWorktreeBaseDirectoryWatcherSyncContextMock,
  setWorktreeCatalogRemoteClientNotifierMock,
  setupAutoUpdaterMock,
  systemPreferencesAskForMediaAccessMock,
  systemPreferencesGetMediaAccessStatusMock
} from './attach-main-window-services-test-harness'

describe('attachMainWindowServices', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    systemPreferencesAskForMediaAccessMock.mockResolvedValue(true)
    systemPreferencesGetMediaAccessStatusMock.mockReturnValue('granted')
  })

  it('gives host-local catalog notifiers the runtime', () => {
    const runtime = createRuntime()

    attachMainWindowServices(createMainWindow() as never, createStore(), runtime as never)

    expect(setRepoRemoteClientNotifierMock).toHaveBeenCalledWith(runtime)
    expect(setWorktreeCatalogRemoteClientNotifierMock).toHaveBeenCalledWith(runtime)
  })

  it('reloads the app renderer through main and marks expected renderer teardown', async () => {
    const onBeforeRendererReload = vi.fn()
    const mainWindow = createMainWindow()

    attachMainWindowServices(
      mainWindow as never,
      createStore(),
      createRuntime() as never,
      undefined,
      undefined,
      { onBeforeRendererReload }
    )

    expect(removeHandlerMock).toHaveBeenCalledWith('app:reload')
    const reloadHandler = handleMock.mock.calls.find(([channel]) => channel === 'app:reload')?.[1]
    expect(reloadHandler).toBeTypeOf('function')

    await reloadHandler?.({ sender: mainWindow.webContents })

    expect(onBeforeRendererReload).toHaveBeenCalledWith({
      webContentsId: 1,
      ignoreCache: false
    })
    expect(mainWindow.webContents.reload).toHaveBeenCalledTimes(1)
  })

  it('hydrates once after the local PTY provider barrier resolves', async () => {
    const providerStartup = deferred()
    const store = createStore()

    attachMainWindowServices(
      createMainWindow() as never,
      store,
      createRuntime() as never,
      undefined,
      undefined,
      { awaitLocalPtyProviderStartup: () => providerStartup.promise }
    )

    expect(hydrateLocalPtyRegistryAtBootMock).not.toHaveBeenCalled()

    providerStartup.resolve()
    await providerStartup.promise
    await Promise.resolve()

    expect(hydrateLocalPtyRegistryAtBootMock).toHaveBeenCalledExactlyOnceWith(store)
  })

  it('passes injected update quit cleanup to the auto-updater', async () => {
    const onBeforeUpdateQuit = vi.fn()
    const store = createStore()
    const mainWindow = createMainWindow()

    attachMainWindowServices(
      mainWindow as never,
      store,
      createRuntime() as never,
      undefined,
      undefined,
      {
        onBeforeUpdateQuit,
        onBeforeUpdateQuitFailure: 'abort',
        updateInstallMode: 'supervised-headless-serve'
      }
    )

    // Deferred to first paint — must not be configured at attach time.
    expect(setupAutoUpdaterMock).not.toHaveBeenCalled()
    await fireReadyToShow(mainWindow)
    expect(setupAutoUpdaterMock).toHaveBeenCalledTimes(1)
    const [updaterWindow, updaterOptions] = setupAutoUpdaterMock.mock.calls[0]
    expect(updaterWindow).toBe(mainWindow)
    expect(updaterOptions).toMatchObject({
      installMode: 'supervised-headless-serve',
      onBeforeQuitFailure: 'abort'
    })
    await setupAutoUpdaterMock.mock.calls[0][1].onBeforeQuit()

    expect(onBeforeUpdateQuit).toHaveBeenCalledTimes(1)
    expect(store.flushPendingAsync).toHaveBeenCalledTimes(1)
  })

  it('flushes the store before update quit when no cleanup is injected', async () => {
    const store = createStore()
    const mainWindow = createMainWindow()

    attachMainWindowServices(mainWindow as never, store, createRuntime() as never)

    await fireReadyToShow(mainWindow)
    await setupAutoUpdaterMock.mock.calls[0][1].onBeforeQuit()

    expect(store.flushPendingAsync).toHaveBeenCalledTimes(1)
  })

  it('ignores app reload requests from non-main webContents', async () => {
    const onBeforeRendererReload = vi.fn()
    const mainWindow = createMainWindow()

    attachMainWindowServices(
      mainWindow as never,
      createStore(),
      createRuntime() as never,
      undefined,
      undefined,
      { onBeforeRendererReload }
    )

    const reloadHandler = handleMock.mock.calls.find(([channel]) => channel === 'app:reload')?.[1]
    await reloadHandler?.({ sender: { id: 999 } })

    expect(onBeforeRendererReload).not.toHaveBeenCalled()
    expect(mainWindow.webContents.reload).not.toHaveBeenCalled()
  })

  it('ignores app reload requests after the main window is destroyed without rereading webContents', () => {
    const onBeforeRendererReload = vi.fn()
    const mainWindow = createMainWindow()
    const mainWebContents = mainWindow.webContents

    attachMainWindowServices(
      mainWindow as never,
      createStore(),
      createRuntime() as never,
      undefined,
      undefined,
      { onBeforeRendererReload }
    )

    const reloadHandler = handleMock.mock.calls.find(([channel]) => channel === 'app:reload')?.[1]
    mainWindow.isDestroyed?.mockReturnValue(true)
    Object.defineProperty(mainWindow, 'webContents', {
      get: () => {
        throw new Error('webContents should not be read after registration')
      }
    })

    expect(() => reloadHandler?.({ sender: mainWebContents })).not.toThrow()

    expect(onBeforeRendererReload).not.toHaveBeenCalled()
    expect(mainWebContents.reload).not.toHaveBeenCalled()
  })

  it('ignores app reload requests after the main webContents is destroyed', async () => {
    const onBeforeRendererReload = vi.fn()
    const mainWindow = createMainWindow()

    attachMainWindowServices(
      mainWindow as never,
      createStore(),
      createRuntime() as never,
      undefined,
      undefined,
      { onBeforeRendererReload }
    )

    const reloadHandler = handleMock.mock.calls.find(([channel]) => channel === 'app:reload')?.[1]
    mainWindow.webContents.isDestroyed?.mockReturnValue(true)
    await reloadHandler?.({ sender: mainWindow.webContents })

    expect(onBeforeRendererReload).not.toHaveBeenCalled()
    expect(mainWindow.webContents.reload).not.toHaveBeenCalled()
  })

  it('removes the app reload IPC handler when the owning window closes', () => {
    const mainWindowOnMock = vi.fn()
    const mainWindow = createMainWindow()
    mainWindow.on = mainWindowOnMock

    attachMainWindowServices(mainWindow as never, createStore(), createRuntime() as never)

    removeHandlerMock.mockClear()
    const closedHandlers = getClosedHandlers(mainWindowOnMock)
    expect(closedHandlers.length).toBeGreaterThan(0)
    for (const handler of closedHandlers) {
      handler()
    }

    expect(removeHandlerMock).toHaveBeenCalledWith('app:reload')
  })

  it('keeps a newer app reload handler when an older window closes late', () => {
    const oldWindowOnMock = vi.fn()
    const oldWindow = createMainWindow()
    oldWindow.on = oldWindowOnMock
    attachMainWindowServices(oldWindow as never, createStore(), createRuntime() as never)
    const oldClosedHandlers = getClosedHandlers(oldWindowOnMock)

    const newWindowOnMock = vi.fn()
    const newWindow = createMainWindow()
    newWindow.on = newWindowOnMock
    attachMainWindowServices(newWindow as never, createStore(), createRuntime() as never)

    removeHandlerMock.mockClear()
    for (const handler of oldClosedHandlers) {
      handler()
    }

    expect(removeHandlerMock).not.toHaveBeenCalledWith('app:reload')

    for (const handler of getClosedHandlers(newWindowOnMock)) {
      handler()
    }
    expect(removeHandlerMock).toHaveBeenCalledWith('app:reload')
  })

  it('only allows the explicit permission allowlist', async () => {
    attachMainWindowServices(createMainWindow() as never, createStore(), createRuntime() as never)

    expect(setPermissionRequestHandlerMock).toHaveBeenCalledTimes(1)
    const permissionHandler = setPermissionRequestHandlerMock.mock.calls[0][0]
    const callback = vi.fn()

    permissionHandler(null, 'media', callback, { mediaTypes: ['audio'] })
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(true))
    permissionHandler(null, 'fullscreen', callback)
    permissionHandler(null, 'pointerLock', callback)
    permissionHandler(null, 'clipboard-read', callback)

    expect(callback.mock.calls).toEqual([[true], [true], [true], [false]])
  })

  it('requests macOS media access only when the renderer asks for media', async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    try {
      attachMainWindowServices(createMainWindow() as never, createStore(), createRuntime() as never)

      expect(systemPreferencesAskForMediaAccessMock).not.toHaveBeenCalled()

      const permissionHandler = setPermissionRequestHandlerMock.mock.calls[0][0]
      const callback = vi.fn()
      permissionHandler(null, 'media', callback, { mediaTypes: ['audio', 'video'] })

      await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(true))
      expect(systemPreferencesAskForMediaAccessMock.mock.calls).toEqual([
        ['microphone'],
        ['camera']
      ])
    } finally {
      Object.defineProperty(process, 'platform', platform ?? { value: process.platform })
    }
  })

  it('clears browser guest registrations when the main window closes', () => {
    const mainWindowOnMock = vi.fn()
    const mainWindow = createMainWindow()
    mainWindow.on = mainWindowOnMock

    attachMainWindowServices(mainWindow as never, createStore(), createRuntime() as never)

    const closedHandler = getClosedHandlers(mainWindowOnMock).at(-1)
    expect(closedHandler).toBeTypeOf('function')
    closedHandler?.()
    expect(browserManagerUnregisterAllMock).toHaveBeenCalledTimes(1)
  })

  it('removes the native file-drop relay when the main window closes', () => {
    const mainWindowOnMock = vi.fn()
    const mainWindow = createMainWindow({ send: vi.fn() })
    mainWindow.on = mainWindowOnMock

    attachMainWindowServices(mainWindow as never, createStore(), createRuntime() as never)

    const channel = 'terminal:file-dropped-from-preload'
    const relayHandler = onMock.mock.calls.find(([event]) => event === channel)?.[1]
    expect(relayHandler).toBeTypeOf('function')
    expect(removeAllListenersMock).toHaveBeenCalledWith(channel)

    const closedHandlers = getClosedHandlers(mainWindowOnMock)
    for (const handler of closedHandlers) {
      handler()
    }

    expect(removeListenerMock).toHaveBeenCalledWith(channel, relayHandler)
  })

  it('relays native file drops only from the owning renderer webContents', () => {
    const sendMock = vi.fn()
    const mainWindow = createMainWindow({ send: sendMock })

    attachMainWindowServices(mainWindow as never, createStore(), createRuntime() as never)

    const channel = 'terminal:file-dropped-from-preload'
    const relayHandler = onMock.mock.calls.find(([event]) => event === channel)?.[1]
    const payload = { paths: ['/tmp/a'], target: 'editor' }

    relayHandler?.({ sender: { id: 999 } }, payload)

    expect(sendMock).not.toHaveBeenCalled()

    relayHandler?.({ sender: mainWindow.webContents }, payload)

    expect(sendMock).toHaveBeenCalledWith('terminal:file-drop', payload)
  })

  it('ignores malformed native file-drop payloads from the owning renderer', () => {
    const sendMock = vi.fn()
    const mainWindow = createMainWindow({ send: sendMock })

    attachMainWindowServices(mainWindow as never, createStore(), createRuntime() as never)

    const channel = 'terminal:file-dropped-from-preload'
    const relayHandler = onMock.mock.calls.find(([event]) => event === channel)?.[1]

    relayHandler?.(
      { sender: mainWindow.webContents },
      { paths: ['C:\\Users\\alice\\secret.txt'], target: 'browser' }
    )
    relayHandler?.(
      { sender: mainWindow.webContents },
      { paths: ['/tmp/a'], target: 'file-explorer' }
    )

    expect(sendMock).not.toHaveBeenCalled()
  })

  it('ignores native file drops after the owning webContents is destroyed', () => {
    const sendMock = vi.fn()
    const mainWindow = createMainWindow({ send: sendMock })

    attachMainWindowServices(mainWindow as never, createStore(), createRuntime() as never)

    const channel = 'terminal:file-dropped-from-preload'
    const relayHandler = onMock.mock.calls.find(([event]) => event === channel)?.[1]
    mainWindow.webContents.isDestroyed?.mockReturnValue(true)

    relayHandler?.({ sender: mainWindow.webContents }, { paths: ['/tmp/a'], target: 'editor' })

    expect(sendMock).not.toHaveBeenCalled()
  })

  it('clears the runtime notifier when the owning window closes', () => {
    const mainWindowOnMock = vi.fn()
    const mainWindow = createMainWindow()
    mainWindow.on = mainWindowOnMock
    const runtime = createRuntime()

    attachMainWindowServices(mainWindow as never, createStore(), runtime as never)

    runtime.setNotifier.mockClear()
    for (const handler of getClosedHandlers(mainWindowOnMock)) {
      handler()
    }

    expect(runtime.markGraphUnavailable).toHaveBeenCalledWith(1)
    expect(runtime.setNotifier).toHaveBeenCalledWith(null)
  })

  it('keeps a newer runtime notifier when an older window closes late', () => {
    const runtime = createRuntime()
    const oldWindowOnMock = vi.fn()
    const oldWindow = createMainWindow()
    oldWindow.on = oldWindowOnMock
    attachMainWindowServices(oldWindow as never, createStore(), runtime as never)
    const oldClosedHandlers = getClosedHandlers(oldWindowOnMock)

    const newWindowOnMock = vi.fn()
    const newWindow = createMainWindow()
    newWindow.on = newWindowOnMock
    attachMainWindowServices(newWindow as never, createStore(), runtime as never)

    runtime.setNotifier.mockClear()
    for (const handler of oldClosedHandlers) {
      handler()
    }

    expect(runtime.setNotifier).not.toHaveBeenCalledWith(null)

    for (const handler of getClosedHandlers(newWindowOnMock)) {
      handler()
    }
    expect(runtime.setNotifier).toHaveBeenCalledWith(null)
  })

  it('forwards runtime notifier events to the renderer', () => {
    const sendMock = vi.fn()
    const webContentsOnMock = vi.fn()
    const mainWindowOnMock = vi.fn()
    const mainWindow = createMainWindow({ on: webContentsOnMock, send: sendMock })
    mainWindow.isDestroyed = vi.fn(() => false)
    mainWindow.on = mainWindowOnMock
    const runtime = createRuntime()

    attachMainWindowServices(mainWindow as never, createStore(), runtime as never)

    expect(runtime.setNotifier).toHaveBeenCalledTimes(1)
    type IdMove = { oldWorktreeId: string; newWorktreeId: string }
    const notifier = runtime.setNotifier.mock.calls[0][0] as {
      worktreesChanged: (...args: [string, IdMove?, IdMove[]?, boolean?]) => void
      reposChanged: () => void
      activateWorktree: (
        repoId: string,
        worktreeId: string,
        setup?: { runnerScriptPath: string; envVars: Record<string, string> }
      ) => void
    }

    const shieldMigration = { oldWorktreeId: 'feature', newWorktreeId: 'temporary' }
    notifier.worktreesChanged('repo-1')
    notifier.worktreesChanged('repo-1', undefined, [shieldMigration])
    notifier.worktreesChanged('repo-1', undefined, [shieldMigration], true)
    notifier.reposChanged()
    notifier.activateWorktree('repo-1', 'wt-1', {
      runnerScriptPath: '/tmp/repo/.git/orca/setup-runner.sh',
      envVars: {
        ORCA_ROOT_PATH: '/tmp/repo',
        ORCA_WORKTREE_PATH: '/tmp/worktrees/wt-1'
      }
    })

    expect(sendMock.mock.calls).toEqual([
      ['worktrees:changed', { repoId: 'repo-1' }],
      ['worktrees:changed', { repoId: 'repo-1', migrations: [shieldMigration] }],
      ['worktrees:changed', { repoId: 'repo-1', migrations: [shieldMigration], shieldOnly: true }],
      ['repos:changed'],
      [
        'ui:activateWorktree',
        {
          repoId: 'repo-1',
          worktreeId: 'wt-1',
          setup: {
            runnerScriptPath: '/tmp/repo/.git/orca/setup-runner.sh',
            envVars: {
              ORCA_ROOT_PATH: '/tmp/repo',
              ORCA_WORKTREE_PATH: '/tmp/worktrees/wt-1'
            }
          }
        }
      ]
    ])
    expect(runWorktreeChangeInvalidatorsMock).toHaveBeenCalledWith('repo-1')
    expect(runWorktreeChangeInvalidatorsMock.mock.invocationCallOrder[0]).toBeLessThan(
      sendMock.mock.invocationCallOrder[0]
    )
  })

  it('marks renderer process loss as a graph reload failure', () => {
    const mainWindow = createMainWindow()
    const runtime = createRuntime()
    attachMainWindowServices(mainWindow as never, createStore(), runtime as never)

    const handlers = mainWindow.webContents.on.mock.calls
      .filter(([event]) => event === 'render-process-gone')
      .map(([, handler]) => handler as () => void)
    for (const handler of handlers) {
      handler()
    }

    expect(runtime.markGraphReloadFailed).toHaveBeenCalledWith(1, 'renderer-process-gone')
  })

  it('accepts terminal reveal replies only from the main window renderer', async () => {
    const sendMock = vi.fn()
    const mainWindow = createMainWindow({ send: sendMock })
    const runtime = createRuntime()

    attachMainWindowServices(mainWindow as never, createStore(), runtime as never)

    const notifier = runtime.setNotifier.mock.calls[0][0] as {
      revealTerminalSession: (
        worktreeId: string,
        opts: {
          ptyId: string
          title?: string
          cwd?: string
          viewMode?: 'terminal' | 'chat'
          activate?: boolean
        }
      ) => Promise<{ tabId: string; title?: string }>
    }
    const revealPromise = notifier.revealTerminalSession('wt-1', {
      ptyId: 'pty-1',
      title: 'SSH tmux',
      cwd: '/repo/packages/web',
      viewMode: 'chat'
    })
    const sentPayload = sendMock.mock.calls.find(
      ([channel]) => channel === 'ui:createTerminal'
    )?.[1]
    const handler = onMock.mock.calls.find(
      ([channel]) => channel === 'terminal:tabCreateReply'
    )?.[1]
    expect(sentPayload).toMatchObject({ cwd: '/repo/packages/web', viewMode: 'chat' })

    handler?.(
      { sender: { send: vi.fn() } },
      { requestId: sentPayload.requestId, error: 'spoofed renderer reply' }
    )
    expect(removeListenerMock).not.toHaveBeenCalledWith('terminal:tabCreateReply', handler)

    handler?.(
      { sender: mainWindow.webContents },
      { requestId: sentPayload.requestId, tabId: 'tab-1', title: 'SSH tmux' }
    )

    await expect(revealPromise).resolves.toEqual({ tabId: 'tab-1', title: 'SSH tmux' })
    expect(removeListenerMock).toHaveBeenCalledWith('terminal:tabCreateReply', handler)
  })

  it('requires an exact renderer identity receipt for recovered worker reveals', async () => {
    const sendMock = vi.fn()
    const mainWindow = createMainWindow({ send: sendMock })
    const runtime = createRuntime()

    attachMainWindowServices(mainWindow as never, createStore(), runtime as never)

    const notifier = runtime.setNotifier.mock.calls[0][0] as {
      revealTerminalSession: (
        worktreeId: string,
        opts: {
          ptyId: string
          tabId: string
          leafId: string
          expectedProcessIdentity: { terminalHandle: string; incarnationId: string }
        }
      ) => Promise<unknown>
    }
    const opts = {
      ptyId: 'pty-worker',
      tabId: 'tab-worker',
      leafId: 'leaf-worker',
      expectedProcessIdentity: {
        terminalHandle: 'term_worker',
        incarnationId: 'inc-worker'
      }
    }
    const mismatch = notifier.revealTerminalSession('worktree-1', opts)
    const mismatchPayload = sendMock.mock.calls.at(-1)?.[1]
    const mismatchHandler = onMock.mock.calls.findLast(
      ([channel]) => channel === 'terminal:tabCreateReply'
    )?.[1]
    mismatchHandler?.(
      { sender: mainWindow.webContents },
      {
        requestId: mismatchPayload.requestId,
        tabId: 'tab-worker',
        identity: {
          worktreeId: 'worktree-1',
          tabId: 'tab-worker',
          leafId: 'leaf-worker',
          ptyId: 'pty-replacement'
        }
      }
    )
    await expect(mismatch).rejects.toThrow('terminal_reveal_identity_mismatch')

    const exact = notifier.revealTerminalSession('worktree-1', opts)
    const exactPayload = sendMock.mock.calls.at(-1)?.[1]
    const exactHandler = onMock.mock.calls.findLast(
      ([channel]) => channel === 'terminal:tabCreateReply'
    )?.[1]
    const identity = {
      worktreeId: 'worktree-1',
      tabId: 'tab-worker',
      leafId: 'leaf-worker',
      ptyId: 'pty-worker'
    }
    exactHandler?.(
      { sender: mainWindow.webContents },
      { requestId: exactPayload.requestId, tabId: 'tab-worker', identity }
    )
    await expect(exact).resolves.toEqual({
      tabId: 'tab-worker',
      title: undefined,
      identity
    })
  })

  it('keeps deferred worktree watcher setup inside the service boundary', async () => {
    const mainWindow = createMainWindow()
    const store = createStore()

    vi.useFakeTimers()
    try {
      attachMainWindowServices(mainWindow as never, store, createRuntime() as never)

      expect(setWorktreeBaseDirectoryWatcherSyncContextMock).toHaveBeenCalledWith(store, mainWindow)
      expect(scheduleWorktreeBaseDirectoryWatcherSyncMock).toHaveBeenCalledWith(store, mainWindow)

      await vi.advanceTimersByTimeAsync(100)
    } finally {
      vi.useRealTimers()
    }
  })
})
