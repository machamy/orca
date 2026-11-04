import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compareAppVersions } from '../shared/app-version'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'
import { updaterMainWindow } from './updater-test-main-window'

const { autoUpdaterMock, moduleFactories, resetUpdaterMocks } = await vi.hoisted(async () =>
  (await import('./updater-test-harness')).createUpdaterMocks()
)
const { fetchNewerReleaseTagsWithReadiness, setUserDefault } = vi.hoisted(() => ({
  fetchNewerReleaseTagsWithReadiness: vi.fn(),
  setUserDefault: vi.fn()
}))

vi.mock('electron', () => ({
  ...moduleFactories.electron(),
  systemPreferences: { setUserDefault }
}))
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('./ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('./linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./updater-prerelease-feed', () => ({
  ...moduleFactories.updaterPrereleaseFeed(),
  fetchNewerReleaseTagsWithReadiness
}))
vi.mock('./local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('./local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())

warmUpdaterModule()

const INTERNAL_FEED = 'https://updates.example.test/orca'

function expectOnlyInternalFeed(): void {
  expect(autoUpdaterMock.setFeedURL).toHaveBeenCalled()
  for (const [feed] of autoUpdaterMock.setFeedURL.mock.calls) {
    expect(feed).toEqual({ provider: 'generic', url: INTERNAL_FEED })
  }
  expect(fetchNewerReleaseTagsWithReadiness).not.toHaveBeenCalled()
}

// Fork: an internal build and the official feed must never both own /Applications/Orca.app.
describe('updater internal feed (fork)', () => {
  beforeEach(() => {
    resetUpdaterMocks()
    fetchNewerReleaseTagsWithReadiness.mockReset()
    setUserDefault.mockReset()
  })

  it('runs the startup check against the internal folder, never the official releases', async () => {
    const { setupAutoUpdater } = await loadUpdaterModule()
    setupAutoUpdater(updaterMainWindow(vi.fn()), {
      getLastUpdateCheckAt: () => null,
      internalUpdateFeedUrl: INTERNAL_FEED
    })

    await vi.waitFor(() => expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1))
    expectOnlyInternalFeed()
  })

  it('keeps Check for Updates on the internal folder for every modifier variant', async () => {
    const { setupAutoUpdater, checkForUpdatesFromMenu } = await loadUpdaterModule()
    setupAutoUpdater(updaterMainWindow(vi.fn()), {
      getLastUpdateCheckAt: () => Date.now(),
      internalUpdateFeedUrl: INTERNAL_FEED
    })

    checkForUpdatesFromMenu({ includePrerelease: true })

    await vi.waitFor(() => expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1))
    expectOnlyInternalFeed()
  })

  it('refuses a pinned official build, even through a direct IPC call', async () => {
    const { setupAutoUpdater, checkForUpdatesFromMenu } = await loadUpdaterModule()
    setupAutoUpdater(updaterMainWindow(vi.fn()), {
      getLastUpdateCheckAt: () => Date.now(),
      internalUpdateFeedUrl: INTERNAL_FEED
    })

    checkForUpdatesFromMenu({ channel: 'stable', targetTag: 'v1.4.300' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expectOnlyInternalFeed()
  })

  it('keeps the official feed when the build has no internal folder', async () => {
    const { setupAutoUpdater } = await loadUpdaterModule()
    setupAutoUpdater(updaterMainWindow(vi.fn()), { getLastUpdateCheckAt: () => Date.now() })

    expect(autoUpdaterMock.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://github.com/stablyai/orca/releases/latest/download'
    })
  })

  it('keeps the .app folder through macOS updates only on internal builds', async () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    try {
      const { setupAutoUpdater } = await loadUpdaterModule()
      setupAutoUpdater(updaterMainWindow(vi.fn()), { getLastUpdateCheckAt: () => Date.now() })
      expect(setUserDefault).not.toHaveBeenCalled()

      setupAutoUpdater(updaterMainWindow(vi.fn()), {
        getLastUpdateCheckAt: () => Date.now(),
        internalUpdateFeedUrl: INTERNAL_FEED
      })
      expect(setUserDefault).toHaveBeenCalledWith(
        'SquirrelMacEnableDirectContentsWrite',
        'boolean',
        true
      )
    } finally {
      platform.mockRestore()
    }
  })

  it('reads a rebuilt internal version as newer than the last fork build', () => {
    const local = '1.4.246-machamy.24.local.1793609849052.e708fd1c34ba'
    const first = '1.4.246-machamy.25.internal.1793700000000.aaaaaaaaaaaa'
    const rebuilt = '1.4.246-machamy.25.internal.1793700000001.aaaaaaaaaaaa'
    expect(compareAppVersions(first, local)).toBeGreaterThan(0)
    expect(compareAppVersions(rebuilt, first)).toBeGreaterThan(0)
  })
})
