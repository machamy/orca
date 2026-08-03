import type {
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot
} from '../../../shared/remote-server-update'
import type { RuntimeStatus } from '../../../shared/runtime-types'

type InstallFailureProbeTransport = {
  getUpdaterStatus: (environmentId: string) => Promise<RemoteServerUpdaterSnapshot>
}

/**
 * The install RPC is accepted before the installer runs, so a server that failed to restart keeps
 * publishing the reason through `updater.getStatus`. Reading it turns a three-minute reconnect
 * timeout into the actual cause. Both runtime-id guards matter: a snapshot from a process that is
 * not the one we asked to install describes some other attempt.
 */
export async function readRemoteServerInstallFailure(
  environmentId: string,
  transport: InstallFailureProbeTransport,
  install: RemoteServerUpdateInstallResult,
  runtime: RuntimeStatus
): Promise<string | null> {
  if (runtime.runtimeId !== install.runtimeId) {
    return null
  }
  const snapshot = await transport.getUpdaterStatus(environmentId)
  if (snapshot.runtimeId !== install.runtimeId || snapshot.status.state !== 'error') {
    return null
  }
  return snapshot.status.message
}
