import type { Repo } from '../../../shared/repo-types'
import { OrcaRuntimeWithGetWorktreeTerminalProvisioningHost } from './startup/workspace-terminal-provisioning'
import { scheduleUnitySeedAfterLocalWorktreeCreate } from '../runtime-local-worktree-unity-seed'

/** Fork: the create path's Unity seed hook, a class link so workspace-creation.ts carries one fork line. */
export abstract class OrcaRuntimeWithUnitySeedAfterCreate extends OrcaRuntimeWithGetWorktreeTerminalProvisioningHost {
  /** Seeds a Unity repo's fresh worktree from the default checkout in the background, so the first open skips the full reimport. */
  protected scheduleUnitySeedForCreatedWorktree(repo: Repo, worktreePath: string): void {
    scheduleUnitySeedAfterLocalWorktreeCreate({
      repo,
      worktreePath,
      listWorktrees: () => this.listResolvedWorktrees(),
      offer: () => this.notifier?.unityAutoSeedOffer?.(repo.id, worktreePath)
    })
  }
}
