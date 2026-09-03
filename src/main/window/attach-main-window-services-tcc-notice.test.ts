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
  acknowledgePendingTccPromptNoticeMock,
  consumePendingTccPromptNoticeMock,
  createMainWindow,
  createRuntime,
  createStore,
  getClosedHandlers,
  handleMock,
  releasePendingTccPromptNoticeMock,
  removeHandlerMock,
  systemPreferencesAskForMediaAccessMock,
  systemPreferencesGetMediaAccessStatusMock
} from './attach-main-window-services-test-harness'

describe('attachMainWindowServices macOS TCC prompt notice', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    systemPreferencesAskForMediaAccessMock.mockResolvedValue(true)
    systemPreferencesGetMediaAccessStatusMock.mockReturnValue('granted')
  })

  it('replaces the TCC handlers when the main window is reattached', () => {
    attachMainWindowServices(createMainWindow() as never, createStore(), createRuntime() as never)
    const releaseCount = releasePendingTccPromptNoticeMock.mock.calls.length
    attachMainWindowServices(createMainWindow() as never, createStore(), createRuntime() as never)

    for (const channel of [
      'macosTccPrompts:consumePending',
      'macosTccPrompts:acknowledgePending',
      'macosTccPrompts:releasePending',
      'macosTccPrompts:dismiss'
    ]) {
      expect(removeHandlerMock.mock.calls.filter(([value]) => value === channel)).toHaveLength(2)
      expect(handleMock.mock.calls.filter(([value]) => value === channel)).toHaveLength(2)
    }
    expect(releasePendingTccPromptNoticeMock).toHaveBeenCalledTimes(releaseCount + 1)
  })

  it('lets only the current main renderer consume the pending TCC notice', () => {
    const mainWindow = createMainWindow()
    consumePendingTccPromptNoticeMock.mockReturnValue({ claimId: 1, promptCount: 3 })
    attachMainWindowServices(mainWindow as never, createStore(), createRuntime() as never)

    const handler = handleMock.mock.calls.find(
      ([channel]) => channel === 'macosTccPrompts:consumePending'
    )?.[1]
    expect(handler?.({ sender: { id: 999 } })).toBeNull()
    expect(consumePendingTccPromptNoticeMock).not.toHaveBeenCalled()
    expect(handler?.({ sender: mainWindow.webContents })).toEqual({ claimId: 1, promptCount: 3 })
    expect(consumePendingTccPromptNoticeMock).toHaveBeenCalledWith(expect.any(Number))
  })

  it('acknowledges a claim only from the current main renderer', () => {
    const mainWindow = createMainWindow()
    attachMainWindowServices(mainWindow as never, createStore(), createRuntime() as never)

    const handler = handleMock.mock.calls.find(
      ([channel]) => channel === 'macosTccPrompts:acknowledgePending'
    )?.[1]
    handler?.({ sender: { id: 999 } }, 7)
    handler?.({ sender: mainWindow.webContents }, Number.NaN)
    expect(acknowledgePendingTccPromptNoticeMock).not.toHaveBeenCalled()

    handler?.({ sender: mainWindow.webContents }, 7)
    expect(acknowledgePendingTccPromptNoticeMock).toHaveBeenCalledWith(expect.any(Number), 7)
  })

  it('releases a claim only from the current main renderer', () => {
    const mainWindow = createMainWindow()
    attachMainWindowServices(mainWindow as never, createStore(), createRuntime() as never)
    releasePendingTccPromptNoticeMock.mockClear()

    const handler = handleMock.mock.calls.find(
      ([channel]) => channel === 'macosTccPrompts:releasePending'
    )?.[1]
    handler?.({ sender: { id: 999 } }, 7)
    handler?.({ sender: mainWindow.webContents }, Number.NaN)
    expect(releasePendingTccPromptNoticeMock).not.toHaveBeenCalled()

    handler?.({ sender: mainWindow.webContents }, 7)
    expect(releasePendingTccPromptNoticeMock).toHaveBeenCalledWith(expect.any(Number), 7)
  })

  it('releases the owner claim when the main renderer reloads or crashes', () => {
    const mainWindow = createMainWindow()
    attachMainWindowServices(mainWindow as never, createStore(), createRuntime() as never)
    const handlers = (event: string): (() => void)[] =>
      mainWindow.webContents.on.mock.calls
        .filter(([name]) => name === event)
        .map(([, handler]) => handler as () => void)

    releasePendingTccPromptNoticeMock.mockClear()
    mainWindow.webContents.isLoadingMainFrame.mockReturnValue(false)
    for (const handler of handlers('did-start-loading')) {
      handler()
    }
    expect(releasePendingTccPromptNoticeMock).not.toHaveBeenCalled()

    mainWindow.webContents.isLoadingMainFrame.mockReturnValue(true)
    for (const handler of handlers('did-start-loading')) {
      handler()
    }
    expect(releasePendingTccPromptNoticeMock).toHaveBeenCalledOnce()

    releasePendingTccPromptNoticeMock.mockClear()
    for (const handler of handlers('render-process-gone')) {
      handler()
    }
    expect(releasePendingTccPromptNoticeMock).toHaveBeenCalledOnce()
  })

  it('removes the TCC handlers when the owning window closes', () => {
    const mainWindow = createMainWindow()
    attachMainWindowServices(mainWindow as never, createStore(), createRuntime() as never)

    removeHandlerMock.mockClear()
    releasePendingTccPromptNoticeMock.mockClear()
    for (const handler of getClosedHandlers(mainWindow.on)) {
      handler()
    }

    expect(removeHandlerMock).toHaveBeenCalledWith('macosTccPrompts:consumePending')
    expect(removeHandlerMock).toHaveBeenCalledWith('macosTccPrompts:acknowledgePending')
    expect(removeHandlerMock).toHaveBeenCalledWith('macosTccPrompts:releasePending')
    expect(removeHandlerMock).toHaveBeenCalledWith('macosTccPrompts:dismiss')
    expect(releasePendingTccPromptNoticeMock).toHaveBeenCalledOnce()
  })

  it('keeps newer TCC handlers when an older window closes late', () => {
    const oldWindow = createMainWindow()
    attachMainWindowServices(oldWindow as never, createStore(), createRuntime() as never)
    const oldClosedHandlers = getClosedHandlers(oldWindow.on)
    const newWindow = createMainWindow()
    attachMainWindowServices(newWindow as never, createStore(), createRuntime() as never)

    removeHandlerMock.mockClear()
    for (const handler of oldClosedHandlers) {
      handler()
    }
    expect(removeHandlerMock).not.toHaveBeenCalledWith('macosTccPrompts:consumePending')
    expect(removeHandlerMock).not.toHaveBeenCalledWith('macosTccPrompts:acknowledgePending')
    expect(removeHandlerMock).not.toHaveBeenCalledWith('macosTccPrompts:releasePending')
    expect(removeHandlerMock).not.toHaveBeenCalledWith('macosTccPrompts:dismiss')

    for (const handler of getClosedHandlers(newWindow.on)) {
      handler()
    }
    expect(removeHandlerMock).toHaveBeenCalledWith('macosTccPrompts:consumePending')
    expect(removeHandlerMock).toHaveBeenCalledWith('macosTccPrompts:acknowledgePending')
    expect(removeHandlerMock).toHaveBeenCalledWith('macosTccPrompts:releasePending')
    expect(removeHandlerMock).toHaveBeenCalledWith('macosTccPrompts:dismiss')
  })
})
