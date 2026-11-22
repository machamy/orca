import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeSettingsProjection } from '../../core-desktop/native-settings-projection'
import type { UpdaterSetupOptions } from './updater-setup'

const { setupMock } = vi.hoisted(() => ({
  setupMock: vi.fn<(window: BrowserWindow, options?: UpdaterSetupOptions) => void>()
}))

vi.mock('electron', () => ({ app: {}, ipcMain: {} }))
vi.mock('../updater-service', () => ({ setupAutoUpdater: setupMock }))
vi.mock('./electron-updater-proxy-session', () => ({
  applyProxyToElectronUpdaterSession: vi.fn()
}))
vi.mock('../../ipc/ui', () => ({
  isTrustedUIRenderer: () => true,
  getTrustedUIRendererWindow: () => null
}))
vi.mock('../../startup/diagnostics/startup-diagnostics', () => ({
  logStartupMilestone: vi.fn()
}))

function createWindowOwner() {
  const window = Object.assign(new EventEmitter(), { id: 7, isDestroyed: vi.fn(() => false) })
  const store = {
    getSettings: vi.fn((): Record<string, unknown> => ({})),
    getUI: vi.fn(() => ({})),
    requestCoreWrite: vi.fn()
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: setup reads only id/isDestroyed and registers once.
  const mainWindow = window as unknown as BrowserWindow
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: setup reads only these settings methods.
  const persistence = store as unknown as NativeSettingsProjection
  return { mainWindow, store, persistence }
}

describe('main window updater official-check gate', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    setupMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('wires the official-update-check gate and the internal feed from settings', async () => {
    const updater = await import('./main-window-updater')
    const owner = createWindowOwner()
    updater.scheduleMainWindowAutoUpdaterSetup(owner.mainWindow, owner.persistence)
    updater.ensureAutoUpdaterConfigured()
    const options = setupMock.mock.calls[0]?.[1]
    expect(options).toHaveProperty('internalUpdateFeedUrl', null)
    expect(options?.isAutomaticUpdateCheckEnabled?.()).toBe(false)
    owner.store.getSettings.mockReturnValue({ officialUpdateChecks: true })
    expect(options?.isAutomaticUpdateCheckEnabled?.()).toBe(true)
    owner.store.getSettings.mockReturnValue({ automaticUpdates: true })
    expect(options?.getAutomaticUpdates?.()).toBe(false)
  })
})
