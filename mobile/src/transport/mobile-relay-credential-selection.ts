import type { MobileRelayCredentialBundle } from './mobile-relay-credential-bundle'
import type { RelayReconnectController } from './mobile-relay-reconnect-controller'

// Why: the in-memory bundle can be newer than disk (resume confirmations apply
// in memory even when the durable write fails), and disk can be newer than
// memory (pairing recovery or rotation finishing after the supervisor started).
// Comparing current.version keeps whichever credential the relay minted last.
export function fresherRelayCredentialBundle(
  memory: MobileRelayCredentialBundle | null,
  disk: MobileRelayCredentialBundle | null
): MobileRelayCredentialBundle | null {
  if (!memory) {
    return disk
  }
  if (!disk) {
    return memory
  }
  return disk.current.version > memory.current.version ? disk : memory
}

// Why: pairing recovery or a raced rotation can land a fresh durable bundle
// after the supervisor snapshotted its copy; a gated retry must see it instead
// of dialing (or refusing to dial) on stale state forever.
export async function selectDialableRelayCredentials(args: {
  bundle: MobileRelayCredentialBundle | null
  controller: RelayReconnectController
  readBundle: () => Promise<MobileRelayCredentialBundle | null>
  onAdoptedFresherBundle: () => void
}): Promise<{
  bundle: MobileRelayCredentialBundle | null
  credentials: Array<MobileRelayCredentialBundle['current']>
}> {
  let bundle = args.bundle
  let credentials = bundle ? args.controller.eligibleCredentials(bundle.current, bundle.grace) : []
  if (credentials.length > 0) {
    return { bundle, credentials }
  }
  const disk = await args.readBundle().catch(() => null)
  const merged = fresherRelayCredentialBundle(bundle, disk)
  if (merged && merged !== bundle) {
    bundle = merged
    args.controller.acceptFreshCredential(merged.current.version)
    args.onAdoptedFresherBundle()
    credentials = args.controller.eligibleCredentials(merged.current, merged.grace)
  }
  return { bundle, credentials }
}
