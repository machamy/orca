import type { AppState } from '@/store/types'
import { isTerminalLeafId, makePaneKey } from '../../../shared/stable-pane-id'
import { translate } from '@/i18n/i18n'

/**
 * Tells a moved agent that its branch and directory changed under it.
 *
 * "Tell agents what changed" only ever raised a toast for the human, while its
 * own hint promised each agent would be seeded with a note. An agent resumed at
 * the other worktree therefore kept reasoning about the path it started in.
 *
 * The note is typed into the pane, so it may only go to an agent that is idle
 * and waiting for input — writing into one mid-turn would land inside whatever
 * it is composing.
 */
export type DefaultSwitchNoticeTarget = {
  paneKey: string
  ptyId: string
}

export function buildDefaultSwitchNotice(args: { path: string; branch: string }): string {
  // Why so short, and why only this agent's side: the note is injected into every
  // affected agent, so each word is spent from that agent's context. It has to
  // carry three facts and nothing else — where you are now, that it is the same
  // branch and files, and that stored paths are stale.
  return translate(
    'auto.lib.defaultWorktreeSwitchAgentNotice.moved',
    '[Orca] Your worktree moved to {{path}} ({{branch}}). Same branch and files, new path — re-check paths before running commands.',
    { path: args.path, branch: args.branch }
  )
}

/** Agent panes in these worktrees that are live and safe to type into. */
export function collectDefaultSwitchNoticeTargets(
  state: Pick<
    AppState,
    'tabsByWorktree' | 'terminalLayoutsByTabId' | 'agentStatusByPaneKey' | 'ptyIdsByTabId'
  >,
  worktreeIds: readonly string[]
): DefaultSwitchNoticeTarget[] {
  const targets: DefaultSwitchNoticeTarget[] = []
  for (const worktreeId of worktreeIds) {
    for (const tab of state.tabsByWorktree[worktreeId] ?? []) {
      const layout = state.terminalLayoutsByTabId[tab.id]
      const ptyIdsByLeafId = layout?.ptyIdsByLeafId ?? {}
      for (const [leafId, ptyId] of Object.entries(ptyIdsByLeafId)) {
        // A layout can carry a non-UUID leaf from older sessions, and makePaneKey
        // throws on one rather than returning a miss.
        if (!ptyId || !isTerminalLeafId(leafId)) {
          continue
        }
        if (!(state.ptyIdsByTabId[tab.id] ?? []).includes(ptyId)) {
          continue
        }
        const paneKey = makePaneKey(tab.id, leafId)
        const status = state.agentStatusByPaneKey[paneKey]
        // Why only these states: 'working' means a turn is in flight and the
        // note would be typed into the agent's own composition.
        if (!status || (status.state !== 'done' && status.state !== 'waiting')) {
          continue
        }
        targets.push({ paneKey, ptyId })
      }
    }
  }
  return targets
}

/**
 * Delivers the note once per pane, retrying while agents are still coming back.
 *
 * The wake resumes panes over the following seconds and the respawn sweeps run
 * for 75s, so a single pass right after the swap would reach almost none of
 * them. Each pane is written to at most once.
 */
export function deliverDefaultSwitchNotice(args: {
  worktreeIds: readonly string[]
  noticeFor: (worktreeId: string) => string
  getState: () => Pick<
    AppState,
    'tabsByWorktree' | 'terminalLayoutsByTabId' | 'agentStatusByPaneKey' | 'ptyIdsByTabId'
  >
  write: (ptyId: string, data: string) => void
  schedule?: (run: () => void, delayMs: number) => void
  attemptDelaysMs?: readonly number[]
}): void {
  const schedule =
    args.schedule ??
    ((run, delayMs) => {
      setTimeout(run, delayMs)
    })
  const delivered = new Set<string>()
  const attempts = args.attemptDelaysMs ?? [6_000, 15_000, 30_000, 60_000, 90_000]
  for (const delayMs of attempts) {
    schedule(() => {
      for (const worktreeId of args.worktreeIds) {
        const notice = args.noticeFor(worktreeId)
        if (!notice) {
          continue
        }
        for (const target of collectDefaultSwitchNoticeTargets(args.getState(), [worktreeId])) {
          if (delivered.has(target.paneKey)) {
            continue
          }
          delivered.add(target.paneKey)
          // The \r is meant to submit, so the agent reads this as its next
          // message. Only the write is guaranteed — some TUIs don't take the
          // Enter and the text is left in the prompt for the user to send.
          args.write(target.ptyId, `${notice}\r`)
        }
      }
    }, delayMs)
  }
}
