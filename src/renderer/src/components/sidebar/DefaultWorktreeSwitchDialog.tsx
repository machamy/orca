import { useState } from 'react'
import { cn } from '@/lib/utils'
import { DefaultWorktreeSwitchFirstRunWarning } from './DefaultWorktreeSwitchFirstRunWarning'
import {
  DEFAULT_SWITCH_NOTIFY_SCOPE,
  type DefaultSwitchNotifyScope
} from '@/lib/default-worktree-switch-notify-scope'

/** Why the branch and not the folder: an in-place swap moves branches, and the
 *  user picked a branch in this dialog — "the one becoming default" is the
 *  wording they just read. */
const NOTIFY_SCOPES: { value: DefaultSwitchNotifyScope; label: () => string }[] = [
  {
    value: 'both',
    label: () => translate('auto.components.sidebar.DefaultWorktreeSwitchDialog.notifyBoth', 'Both')
  },
  {
    value: 'promoted',
    label: () =>
      translate(
        'auto.components.sidebar.DefaultWorktreeSwitchDialog.notifyPromoted',
        'Incoming default only'
      )
  },
  {
    value: 'demoted',
    label: () =>
      translate(
        'auto.components.sidebar.DefaultWorktreeSwitchDialog.notifyDemoted',
        'Current default only'
      )
  }
]
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { countActiveAgentsForDefaultSwitch } from './default-worktree-switch-live-agents'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { RuntimeDefaultWorktreeSwitchResult } from '../../../../shared/runtime-types'
import type { Worktree } from '../../../../shared/worktree/types'

export type DefaultWorktreeSwitchDialogRequest = {
  source: Worktree
  currentDefault: Worktree
}

function switchErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const known: Record<string, string> = {
    default_worktree_switch_already_default: translate(
      'auto.components.sidebar.DefaultWorktreeSwitchDialog.alreadyDefault',
      'This worktree is already at the default project path.'
    ),
    default_worktree_switch_wsl_unsupported: translate(
      'auto.components.sidebar.DefaultWorktreeSwitchDialog.wslUnsupported',
      'Default worktree switching is not available for WSL projects yet.'
    ),
    default_worktree_switch_detached_head: translate(
      'auto.components.sidebar.DefaultWorktreeSwitchDialog.detachedHead',
      'One of these worktrees is on a detached HEAD (no branch). Check out a branch in both, then try again.'
    ),
    default_worktree_switch_operation_in_progress: translate(
      'auto.components.sidebar.DefaultWorktreeSwitchDialog.operationInProgress',
      'One of these worktrees has a merge, cherry-pick, or revert in progress. Finish or abort it, then try again.'
    ),
    default_worktree_switch_sleep_failed: translate(
      'auto.components.sidebar.DefaultWorktreeSwitchDialog.sleepFailed',
      'Could not sleep the running agents, so the switch was not started. Try again.'
    ),
    default_worktree_switch_ignored_would_be_overwritten: translate(
      'auto.components.sidebar.DefaultWorktreeSwitchDialog.ignoredWouldBeOverwritten',
      'The branch moving in tracks files that are ignored (and present) in the other worktree, so the switch would destroy them with no way back. Move or delete the paths listed below, then try again.'
    ),
    default_worktree_switch_recovery_required: translate(
      'auto.components.sidebar.DefaultWorktreeSwitchDialog.recoveryRequired',
      'The branch swap failed and could not be fully rolled back. Check the two worktrees’ branches; the error lists what to restore.'
    )
  }
  const code = Object.keys(known).find((candidate) => message.includes(candidate))
  return code ? `${known[code]}\n${message}` : message
}

export type DefaultWorktreeSwitchConfirmOptions = {
  /** Mode B: sleep both worktrees and resume each agent where its branch now lives. */
  agentsFollow: boolean
  /** Seed each affected agent with a note about the change on its next turn. */
  notifyAgents: boolean
  notifyScope: DefaultSwitchNotifyScope
  /** Mode A safety: sleep the agents and wake them in place instead of switching live. */
  sleepInPlace: boolean
  /** Carry untracked files with their branch (default) or leave them in place. */
  includeUntracked: boolean
}

export function DefaultWorktreeSwitchDialog({
  request,
  onOpenChange,
  onConfirm
}: {
  request: DefaultWorktreeSwitchDialogRequest | null
  onOpenChange: (open: boolean) => void
  onConfirm: (
    request: DefaultWorktreeSwitchDialogRequest,
    options: DefaultWorktreeSwitchConfirmOptions
  ) => Promise<RuntimeDefaultWorktreeSwitchResult>
}): React.JSX.Element {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const agentsFollow = useAppStore((s) => s.settings?.defaultSwitchAgentsFollow === true)
  const warningAcknowledged = useAppStore(
    (s) => s.settings?.defaultSwitchWarningAcknowledged === true
  )
  const notifyScope = useAppStore(
    (s) => s.settings?.defaultSwitchNotifyScope ?? DEFAULT_SWITCH_NOTIFY_SCOPE
  )
  const notifyAgents = useAppStore((s) => s.settings?.defaultSwitchNotifyAgents === true)
  const keepUntrackedInPlace = useAppStore(
    (s) => s.settings?.defaultSwitchKeepUntrackedInPlace === true
  )
  const updateSettings = useAppStore((s) => s.updateSettings)
  const activeAgentCount = useAppStore((s) =>
    request
      ? countActiveAgentsForDefaultSwitch({
          agentStatusByPaneKey: s.agentStatusByPaneKey,
          worktreeIdByTabId: (tabId) =>
            Object.entries(s.unifiedTabsByWorktree).find(([, tabs]) =>
              tabs.some((tab) => tab.id === tabId)
            )?.[0],
          worktreeIds: [request.source.id, request.currentDefault.id]
        })
      : 0
  )

  const handleConfirm = async (sleepInPlace: boolean): Promise<void> => {
    if (!request || pending) {
      return
    }
    setPending(true)
    setError(null)
    try {
      await onConfirm(request, {
        agentsFollow,
        notifyAgents,
        notifyScope,
        sleepInPlace,
        includeUntracked: !keepUntrackedInPlace
      })
      onOpenChange(false)
    } catch (cause) {
      setError(switchErrorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
        {!warningAcknowledged ? (
          <DefaultWorktreeSwitchFirstRunWarning
            onCancel={() => onOpenChange(false)}
            onAcknowledge={() => updateSettings({ defaultSwitchWarningAcknowledged: true })}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {translate(
                  'auto.components.sidebar.DefaultWorktreeSwitchDialog.title',
                  'Make This the Default Worktree?'
                )}
              </DialogTitle>
              <DialogDescription>
                {translate(
                  'auto.components.sidebar.DefaultWorktreeSwitchDialog.description',
                  'Orca swaps the two worktrees’ branches in place — no folders move, so git’s main worktree stays at the repo path. Each worktree ends on the other’s branch, carrying its uncommitted changes.'
                )}
              </DialogDescription>
            </DialogHeader>

            {request ? (
              <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">
                    {translate(
                      'auto.components.sidebar.DefaultWorktreeSwitchDialog.selectedWorktree',
                      'Repo default path — checks out'
                    )}
                  </div>
                  <div className="break-all text-muted-foreground">
                    {request.currentDefault.path} → {request.source.branch || request.source.path}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-foreground">
                    {translate(
                      'auto.components.sidebar.DefaultWorktreeSwitchDialog.currentDefault',
                      'Selected worktree — checks out'
                    )}
                  </div>
                  <div className="break-all text-muted-foreground">
                    {request.source.path} →{' '}
                    {request.currentDefault.branch || request.currentDefault.path}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="space-y-2 rounded-md border border-border p-3 text-xs">
              <label className="flex cursor-pointer items-start gap-2">
                <Checkbox
                  checked={agentsFollow}
                  onCheckedChange={(v) => updateSettings({ defaultSwitchAgentsFollow: v === true })}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="font-medium text-foreground">
                    {translate(
                      'auto.components.sidebar.DefaultWorktreeSwitchDialog.followLabel',
                      'Agents follow their branch'
                    )}
                  </span>
                  <span className="block text-muted-foreground">
                    {agentsFollow
                      ? translate(
                          'auto.components.sidebar.DefaultWorktreeSwitchDialog.followOnHint',
                          'Sleeps both worktrees and resumes each agent where its branch now lives. Only sleep/resume-capable agents (Claude, Codex) follow.'
                        )
                      : translate(
                          'auto.components.sidebar.DefaultWorktreeSwitchDialog.followOffHint',
                          'Agents stay in their worktree; the branch changes under them. Fastest, no move.'
                        )}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <Checkbox
                  checked={notifyAgents}
                  onCheckedChange={(v) => updateSettings({ defaultSwitchNotifyAgents: v === true })}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="font-medium text-foreground">
                    {translate(
                      'auto.components.sidebar.DefaultWorktreeSwitchDialog.notifyLabel',
                      'Tell agents what changed'
                    )}
                  </span>
                  <span className="block text-muted-foreground">
                    {translate(
                      'auto.components.sidebar.DefaultWorktreeSwitchDialog.notifyHint',
                      'Sends each agent a one-line note naming its new path, on its next turn.'
                    )}
                  </span>
                  {notifyAgents ? (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {NOTIFY_SCOPES.map((scope) => (
                        <button
                          key={scope.value}
                          type="button"
                          onClick={(event) => {
                            // The row is a <label>, so a bare click would toggle the checkbox too.
                            event.preventDefault()
                            updateSettings({ defaultSwitchNotifyScope: scope.value })
                          }}
                          className={cn(
                            'rounded border px-1.5 py-0.5 text-[11px]',
                            notifyScope === scope.value
                              ? 'border-worktree-sidebar-ring/50 bg-worktree-sidebar-accent text-foreground'
                              : 'border-worktree-sidebar-border text-muted-foreground'
                          )}
                        >
                          {scope.label()}
                        </button>
                      ))}
                    </span>
                  ) : null}
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <Checkbox
                  checked={keepUntrackedInPlace}
                  onCheckedChange={(v) =>
                    updateSettings({ defaultSwitchKeepUntrackedInPlace: v === true })
                  }
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="font-medium text-foreground">
                    {translate(
                      'auto.components.sidebar.DefaultWorktreeSwitchDialog.keepUntrackedLabel',
                      'Leave untracked files where they are'
                    )}
                  </span>
                  <span className="block text-muted-foreground">
                    {keepUntrackedInPlace
                      ? translate(
                          'auto.components.sidebar.DefaultWorktreeSwitchDialog.keepUntrackedOnHint',
                          'Untracked files stay in their folder and the branch swaps around them, like ignored files.'
                        )
                      : translate(
                          'auto.components.sidebar.DefaultWorktreeSwitchDialog.keepUntrackedOffHint',
                          'Untracked files travel with their branch, so work-in-progress new files land with the agent that made them.'
                        )}
                  </span>
                </span>
              </label>
            </div>

            {activeAgentCount > 0 ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {translate(
                  'auto.components.sidebar.DefaultWorktreeSwitchDialog.liveAgentsWarning',
                  '{{count}} agent(s) are still mid-task in these worktrees. Their working tree will switch branches under them — let them finish or sleep them first.',
                  { count: activeAgentCount }
                )}
              </div>
            ) : null}

            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {keepUntrackedInPlace
                ? translate(
                    'auto.components.sidebar.DefaultWorktreeSwitchDialog.externalToolsWarningKeepUntracked',
                    'Uncommitted and staged changes to tracked files move with their branch. Untracked and ignored files stay in the folder they are in — and if the other branch tracks one of those paths, the switch is refused rather than overwriting your local file.'
                  )
                : translate(
                    'auto.components.sidebar.DefaultWorktreeSwitchDialog.externalToolsWarning',
                    'Uncommitted, staged AND untracked files move with their branch — untracked files leave the folder they are in now. Ignored files (build output, node_modules) stay in place, and if the other branch tracks an ignored path, the switch is refused rather than overwriting it.'
                  )}
            </div>

            {error ? (
              <div
                role="alert"
                className="whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              >
                {error}
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
                {translate('auto.common.cancel', 'Cancel')}
              </Button>
              {agentsFollow ? (
                // Follow mode always sleeps and moves the agents.
                <Button disabled={pending} onClick={() => void handleConfirm(false)}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {translate(
                    'auto.components.sidebar.DefaultWorktreeSwitchDialog.sleepMoveSwitch',
                    'Sleep, Switch & Move Agents'
                  )}
                </Button>
              ) : activeAgentCount > 0 ? (
                <>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => void handleConfirm(false)}
                  >
                    {translate(
                      'auto.components.sidebar.DefaultWorktreeSwitchDialog.switchAnyway',
                      'Switch Anyway'
                    )}
                  </Button>
                  <Button disabled={pending} onClick={() => void handleConfirm(true)}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                    {translate(
                      'auto.components.sidebar.DefaultWorktreeSwitchDialog.sleepAndSwitch',
                      'Sleep & Switch (in place)'
                    )}
                  </Button>
                </>
              ) : (
                <Button disabled={pending} onClick={() => void handleConfirm(false)}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {translate(
                    'auto.components.sidebar.DefaultWorktreeSwitchDialog.action',
                    'Switch Default'
                  )}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
