import { UpdaterInstallExecution } from '../lifecycle/updater-install-execution'

export abstract class UpdaterInternalFeedPin extends UpdaterInstallExecution {
  // Fork: internal builds read latest-mac.yml from their build-time folder instead of GitHub releases.
  protected pinInternalUpdateFeed(): boolean {
    if (!this.internalUpdateFeedUrl) {
      return false
    }
    this.getAutoUpdater().setFeedURL({ provider: 'generic', url: this.internalUpdateFeedUrl })
    return true
  }
}
