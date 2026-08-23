// Mode B ("agents follow their branch"): after the switch re-keys both
// workspaces' session state, every pane's preserved PTY id still embeds the
// worktree it was spawned under. An agent pane notices the mismatch and cold
// restores with `--resume`; a pane with no sleeping record (a plain shell) has
// no such path — it bare-attaches to the session the sleep already killed,
// paints nothing, and the missed-exit reconciler closes it, taking single-pane
// tabs and split siblings with it. Releasing those identifiers first makes the
// shell respawn fresh in its own tab, at its position, inside its split.
import type {
  TerminalLayoutSnapshot,
  TerminalPaneLayoutNode
} from '../../../shared/terminal-tab-types'

export type FollowSwitchShellPtyRelease = {
  /** Tabs whose tab-level `ptyId` must be dropped. */
  tabIds: string[]
  /** Leaf ids per tab whose `ptyIdsByLeafId` binding must be dropped. */
  leafIdsByTabId: Record<string, string[]>
}

type ReleaseInput = {
  worktreeIds: readonly string[]
  tabsByWorktree: Record<string, readonly { id: string; ptyId: string | null }[] | undefined>
  terminalLayoutsByTabId: Record<string, TerminalLayoutSnapshot | undefined>
  sleepingAgentSessionsByPaneKey: Record<string, unknown>
}

function collectLeafIds(node: TerminalPaneLayoutNode | null | undefined, into: Set<string>): void {
  if (!node) {
    return
  }
  if (node.type === 'leaf') {
    into.add(node.leafId)
    return
  }
  collectLeafIds(node.first, into)
  collectLeafIds(node.second, into)
}

export function planFollowSwitchShellPtyRelease(input: ReleaseInput): FollowSwitchShellPtyRelease {
  const release: FollowSwitchShellPtyRelease = { tabIds: [], leafIdsByTabId: {} }
  const hasRecord = (tabId: string, leafId: string): boolean =>
    Boolean(input.sleepingAgentSessionsByPaneKey[`${tabId}:${leafId}`])

  for (const worktreeId of input.worktreeIds) {
    for (const tab of input.tabsByWorktree[worktreeId] ?? []) {
      const layout = input.terminalLayoutsByTabId[tab.id]
      const ptyIdsByLeafId = layout?.ptyIdsByLeafId ?? {}
      const leafIds = new Set<string>(Object.keys(ptyIdsByLeafId))
      collectLeafIds(layout?.root, leafIds)

      const staleLeafIds = [...leafIds].filter(
        (leafId) => ptyIdsByLeafId[leafId] && !hasRecord(tab.id, leafId)
      )
      if (staleLeafIds.length > 0) {
        release.leafIdsByTabId[tab.id] = staleLeafIds
      }
      if (!tab.ptyId) {
        continue
      }
      // The tab-level id belongs to whichever leaf is bound to it; with no such
      // leaf, only release when the whole tab is recordless — a mixed tab must
      // keep the id its agent pane is about to cold-restore against.
      const owningLeafId = [...leafIds].find((leafId) => ptyIdsByLeafId[leafId] === tab.ptyId)
      const tabIsRecordless = [...leafIds].every((leafId) => !hasRecord(tab.id, leafId))
      if (owningLeafId ? !hasRecord(tab.id, owningLeafId) : tabIsRecordless) {
        release.tabIds.push(tab.id)
      }
    }
  }
  return release
}
