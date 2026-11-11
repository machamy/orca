import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './testing/updater-test-module-loader'
import { updaterMainWindow } from './testing/updater-test-main-window'

const { appMock, autoUpdaterMock, moduleFactories, resetUpdaterMocks } = await vi.hoisted(
  async () => (await import('./testing/updater-test-harness')).createUpdaterMocks()
)

vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('../ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('./linux-package/linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./releases/updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./nudges/nudge-campaign', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./releases/updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('../local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('../local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())

warmUpdaterModule()

// Fork: a fork build reads as older than the same upstream release, so automatic checks are gated.
describe('updater automatic-check gate (fork)', () => {
  beforeEach(() => {
    resetUpdaterMocks()
    vi.useFakeTimers()
  })

  it('skips startup, timer and focus checks while the gate is off', async () => {
    const { setupAutoUpdater } = await loadUpdaterModule()
    setupAutoUpdater(updaterMainWindow(vi.fn()), {
      getLastUpdateCheckAt: () => null,
      isAutomaticUpdateCheckEnabled: () => false
    })

    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000)
    const focus = appMock.on.mock.calls.find(([event]) => event === 'browser-window-focus')?.[1]
    focus?.()

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  })

  it('still runs an explicit Check for Updates while the gate is off', async () => {
    const { setupAutoUpdater, checkForUpdatesFromMenu } = await loadUpdaterModule()
    setupAutoUpdater(updaterMainWindow(vi.fn()), {
      getLastUpdateCheckAt: () => null,
      isAutomaticUpdateCheckEnabled: () => false
    })

    checkForUpdatesFromMenu()

    await vi.waitFor(() => {
      expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)
    })
  })

  it('checks at startup once the gate is on', async () => {
    const { setupAutoUpdater } = await loadUpdaterModule()
    setupAutoUpdater(updaterMainWindow(vi.fn()), {
      getLastUpdateCheckAt: () => null,
      isAutomaticUpdateCheckEnabled: () => true
    })

    await vi.waitFor(() => {
      expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)
    })
  })
})
