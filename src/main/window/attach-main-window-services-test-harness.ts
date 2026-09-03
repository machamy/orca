import { vi } from 'vitest'
import type { Store } from '../persistence'

/**
 * Shared scaffolding for the `attachMainWindowServices` suites: the electron /
 * IPC module stubs it needs before the service module loads, plus the window,
 * store and runtime doubles every case builds on.
 *
 * Why builders and not inline factories: `vi.mock` is hoisted per test file, so
 * each suite calls these from its own hoisted factory instead of re-declaring
 * this surface.
 */
export type MockFn = ReturnType<typeof vi.fn>

export const onMock: MockFn = vi.fn()
export const removeAllListenersMock: MockFn = vi.fn()
export const removeListenerMock: MockFn = vi.fn()
export const setPermissionRequestHandlerMock: MockFn = vi.fn()
export const setPermissionCheckHandlerMock: MockFn = vi.fn()
export const handleMock: MockFn = vi.fn()
export const removeHandlerMock: MockFn = vi.fn()
export const systemPreferencesAskForMediaAccessMock: MockFn = vi.fn()
export const systemPreferencesGetMediaAccessStatusMock: MockFn = vi.fn()
export const registerRepoHandlersMock: MockFn = vi.fn()
export const setRepoRemoteClientNotifierMock: MockFn = vi.fn()
export const setWorktreeCatalogRemoteClientNotifierMock: MockFn = vi.fn()
export const registerWorktreeHandlersMock: MockFn = vi.fn()
export const registerPtyHandlersMock: MockFn = vi.fn()
export const hydrateLocalPtyRegistryAtBootMock: MockFn = vi.fn()
export const setWorktreeBaseDirectoryWatcherSyncContextMock: MockFn = vi.fn()
export const scheduleWorktreeBaseDirectoryWatcherSyncMock: MockFn = vi.fn()
export const setupAutoUpdaterMock: MockFn = vi.fn()
export const browserManagerUnregisterAllMock: MockFn = vi.fn()
export const runWorktreeChangeInvalidatorsMock: MockFn = vi.fn()
export const acknowledgePendingTccPromptNoticeMock: MockFn = vi.fn()
export const consumePendingTccPromptNoticeMock: MockFn = vi.fn()
export const dismissTccPromptNoticeMock: MockFn = vi.fn()
export const releasePendingTccPromptNoticeMock: MockFn = vi.fn()

export type ElectronModuleMock = {
  app: Record<string, never>
  clipboard: Record<string, never>
  systemPreferences: { askForMediaAccess: MockFn; getMediaAccessStatus: MockFn }
  ipcMain: {
    on: MockFn
    removeAllListeners: MockFn
    removeListener: MockFn
    removeHandler: MockFn
    handle: MockFn
  }
  powerMonitor: { on: MockFn; off: MockFn }
}

export function electronModuleMock(): ElectronModuleMock {
  return {
    app: {},
    clipboard: {},
    systemPreferences: {
      askForMediaAccess: systemPreferencesAskForMediaAccessMock,
      getMediaAccessStatus: systemPreferencesGetMediaAccessStatusMock
    },
    ipcMain: {
      on: onMock,
      removeAllListeners: removeAllListenersMock,
      removeListener: removeListenerMock,
      removeHandler: removeHandlerMock,
      handle: handleMock
    },
    powerMonitor: {
      on: vi.fn(),
      off: vi.fn()
    }
  }
}

export function reposModuleMock(): { registerRepoHandlers: MockFn } {
  return { registerRepoHandlers: registerRepoHandlersMock }
}

export function reposChangedNotificationMock(): { setRepoRemoteClientNotifier: MockFn } {
  return { setRepoRemoteClientNotifier: setRepoRemoteClientNotifierMock }
}

export function worktreeCatalogNotificationMock(): {
  setWorktreeCatalogRemoteClientNotifier: MockFn
} {
  return { setWorktreeCatalogRemoteClientNotifier: setWorktreeCatalogRemoteClientNotifierMock }
}

export function worktreesModuleMock(): { registerWorktreeHandlers: MockFn } {
  return { registerWorktreeHandlers: registerWorktreeHandlersMock }
}

export function worktreeChangeInvalidatorsMock(): { runWorktreeChangeInvalidators: MockFn } {
  return { runWorktreeChangeInvalidators: runWorktreeChangeInvalidatorsMock }
}

export function ptyModuleMock(): { getLocalPtyProvider: MockFn; registerPtyHandlers: MockFn } {
  return { getLocalPtyProvider: vi.fn(), registerPtyHandlers: registerPtyHandlersMock }
}

export function hydrateLocalPtyRegistryModuleMock(): { hydrateLocalPtyRegistryAtBoot: MockFn } {
  return { hydrateLocalPtyRegistryAtBoot: hydrateLocalPtyRegistryAtBootMock }
}

export function worktreeBaseDirectoryWatcherMock(): {
  setWorktreeBaseDirectoryWatcherSyncContext: MockFn
  scheduleWorktreeBaseDirectoryWatcherSync: MockFn
} {
  return {
    setWorktreeBaseDirectoryWatcherSyncContext: setWorktreeBaseDirectoryWatcherSyncContextMock,
    scheduleWorktreeBaseDirectoryWatcherSync: scheduleWorktreeBaseDirectoryWatcherSyncMock
  }
}

export function browserManagerModuleMock(): { browserManager: { unregisterAll: MockFn } } {
  return { browserManager: { unregisterAll: browserManagerUnregisterAllMock } }
}

export type UpdaterModuleMock = {
  checkForUpdates: MockFn
  getUpdateStatus: MockFn
  quitAndInstall: MockFn
  dismissNudge: MockFn
  setupAutoUpdater: MockFn
}

export function updaterModuleMock(): UpdaterModuleMock {
  return {
    checkForUpdates: vi.fn(),
    getUpdateStatus: vi.fn(),
    quitAndInstall: vi.fn(),
    dismissNudge: vi.fn(),
    setupAutoUpdater: setupAutoUpdaterMock
  }
}

export type MacosTccPromptNoticeMock = {
  acknowledgePendingTccPromptNotice: MockFn
  consumePendingTccPromptNotice: MockFn
  dismissTccPromptNotice: MockFn
  releasePendingTccPromptNotice: MockFn
}

export function macosTccPromptNoticeMock(): MacosTccPromptNoticeMock {
  return {
    acknowledgePendingTccPromptNotice: acknowledgePendingTccPromptNoticeMock,
    consumePendingTccPromptNotice: consumePendingTccPromptNoticeMock,
    dismissTccPromptNotice: dismissTccPromptNoticeMock,
    releasePendingTccPromptNotice: releasePendingTccPromptNoticeMock
  }
}

export type MainWindowStub = {
  id?: number
  isDestroyed?: MockFn
  on: MockFn
  once: MockFn
  webContents: {
    id?: number
    getURL: MockFn
    isDestroyed?: MockFn
    isLoadingMainFrame: MockFn
    on: MockFn
    send?: MockFn
    reload?: MockFn
    session: {
      setPermissionRequestHandler: MockFn
      setPermissionCheckHandler: MockFn
    }
  }
}

export type RuntimeStub = {
  attachWindow: MockFn
  setNotifier: MockFn
  markRendererReloading: MockFn
  markRendererReloadCancelled: MockFn
  markGraphReloadFailed: MockFn
  markGraphUnavailable: MockFn
}

export function createMainWindow(
  extraWebContents: { isLoadingMainFrame?: MockFn; on?: MockFn; send?: MockFn } = {}
): MainWindowStub {
  return {
    id: 1,
    isDestroyed: vi.fn(() => false),
    on: vi.fn(),
    once: vi.fn(),
    webContents: {
      id: 1,
      getURL: vi.fn(() => 'file:///opt/orca/renderer/index.html'),
      isDestroyed: vi.fn(() => false),
      isLoadingMainFrame: vi.fn(() => true),
      on: vi.fn(),
      reload: vi.fn(),
      session: {
        setPermissionRequestHandler: setPermissionRequestHandlerMock,
        setPermissionCheckHandler: setPermissionCheckHandlerMock
      },
      ...extraWebContents
    }
  }
}

export function createStore(): Store & { flushPendingAsync: MockFn } {
  return {
    getProfileStorageDirectory: vi.fn(() => '/profile-a'),
    flushPendingAsync: vi.fn(() => Promise.resolve())
  } as unknown as Store & { flushPendingAsync: MockFn }
}

export function createRuntime(): RuntimeStub {
  return {
    attachWindow: vi.fn(),
    setNotifier: vi.fn(),
    markRendererReloading: vi.fn(),
    markRendererReloadCancelled: vi.fn(),
    markGraphReloadFailed: vi.fn(),
    markGraphUnavailable: vi.fn()
  }
}

export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

export function getClosedHandlers(mainWindowOnMock: MockFn): (() => void)[] {
  return mainWindowOnMock.mock.calls
    .filter(([event]) => event === 'closed')
    .map(([, handler]) => handler as () => void)
}

// Updater setup is deferred to first paint; fire the captured ready-to-show
// handler and flush its setImmediate hop.
export async function fireReadyToShow(mainWindow: MainWindowStub): Promise<void> {
  const handler = mainWindow.once.mock.calls.find(([event]) => event === 'ready-to-show')?.[1] as
    | (() => void)
    | undefined
  handler?.()
  await new Promise((resolve) => {
    setImmediate(resolve)
  })
}
