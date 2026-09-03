import { parseAppSshPtyId } from '../../../../shared/ssh-pty-id'
import { hasWorktreeSleepIntent } from '@/lib/worktree-sleep-intent'
import { planFollowSwitchShellPtyRelease } from '@/lib/default-worktree-switch-shell-pty-release'
import type { TerminalSlice, TerminalStoreGet, TerminalStoreSet } from './terminal-state'
import {
  consumePendingActivationSpawn,
  getPendingActivationSpawnCount,
  isCurrentDirectSshAuthority,
  isRemoteRuntimePtyId
} from './terminal-pty-identities'

export function createTerminalPtyReleaseActions(
  set: TerminalStoreSet,
  get: TerminalStoreGet
): Pick<
  TerminalSlice,
  'clearTabPtyId' | 'clearDeadLeafPtyBindings' | 'releaseFollowSwitchShellPtyBindings'
> {
  return {
    // Fork: after a mode-B follow switch the moved tabs still name their pre-swap
    // PTY ids; recordless shells bare-attach to sessions the sleep already killed.
    releaseFollowSwitchShellPtyBindings: (worktreeIds) => {
      const state = get()
      const plan = planFollowSwitchShellPtyRelease({
        worktreeIds,
        tabsByWorktree: state.tabsByWorktree,
        terminalLayoutsByTabId: state.terminalLayoutsByTabId,
        sleepingAgentSessionsByPaneKey: state.sleepingAgentSessionsByPaneKey ?? {}
      })
      const releasedTabIds = new Set(plan.tabIds)
      const touchedTabIds = new Set([...plan.tabIds, ...Object.keys(plan.leafIdsByTabId)])
      if (touchedTabIds.size === 0) {
        return 0
      }
      set((s) => {
        const nextTabsByWorktree = { ...s.tabsByWorktree }
        for (const worktreeId of worktreeIds) {
          const tabs = s.tabsByWorktree[worktreeId]
          if (!tabs?.some((tab) => releasedTabIds.has(tab.id) && tab.ptyId)) {
            continue
          }
          nextTabsByWorktree[worktreeId] = tabs.map((tab) =>
            releasedTabIds.has(tab.id) && tab.ptyId ? { ...tab, ptyId: null } : tab
          )
        }
        const nextTerminalLayoutsByTabId = { ...s.terminalLayoutsByTabId }
        for (const [tabId, leafIds] of Object.entries(plan.leafIdsByTabId)) {
          const layout = s.terminalLayoutsByTabId[tabId]
          if (!layout?.ptyIdsByLeafId) {
            continue
          }
          const nextPtyIdsByLeafId = { ...layout.ptyIdsByLeafId }
          for (const leafId of leafIds) {
            delete nextPtyIdsByLeafId[leafId]
          }
          nextTerminalLayoutsByTabId[tabId] = { ...layout, ptyIdsByLeafId: nextPtyIdsByLeafId }
        }
        return {
          tabsByWorktree: nextTabsByWorktree,
          terminalLayoutsByTabId: nextTerminalLayoutsByTabId
        }
      })
      return touchedTabIds.size
    },

    // Fork: after a swap-back the stale ids embed the CURRENT worktree, so the ownership
    // check passes and a remount reattaches to a killed session instead of respawning.
    clearDeadLeafPtyBindings: (tabIds) => {
      let cleared = 0
      set((s) => {
        const nextLayouts = { ...s.terminalLayoutsByTabId }
        const nextTabsByWorktree = { ...s.tabsByWorktree }
        for (const tabId of tabIds) {
          const livePtyIds = new Set(s.ptyIdsByTabId[tabId] ?? [])
          const layout = s.terminalLayoutsByTabId[tabId]
          const bindings = layout?.ptyIdsByLeafId
          if (bindings) {
            const kept: Record<string, string> = {}
            for (const [leafId, leafPtyId] of Object.entries(bindings)) {
              if (livePtyIds.has(leafPtyId)) {
                kept[leafId] = leafPtyId
              } else {
                cleared += 1
              }
            }
            if (Object.keys(kept).length !== Object.keys(bindings).length) {
              nextLayouts[tabId] = { ...layout, ptyIdsByLeafId: kept }
            }
          }
          for (const [worktreeId, tabs] of Object.entries(s.tabsByWorktree)) {
            const index = tabs.findIndex((tab) => tab.id === tabId)
            if (index === -1 || !tabs[index].ptyId || livePtyIds.has(tabs[index].ptyId as string)) {
              continue
            }
            const nextTabs = (nextTabsByWorktree[worktreeId] ?? tabs).slice()
            nextTabs[index] = { ...nextTabs[index], ptyId: null }
            nextTabsByWorktree[worktreeId] = nextTabs
          }
        }
        return { terminalLayoutsByTabId: nextLayouts, tabsByWorktree: nextTabsByWorktree }
      })
      return cleared
    },

    clearTabPtyId: (tabId, ptyId) => {
      if (ptyId && get().pendingPtyShutdownIds[ptyId]) {
        // Why: an owner exit can arrive before its post-stop inventory; keep the renderer binding retryable until verification commits.
        return
      }
      let worktreeId: string | null = null
      let wasActivationSpawn = false
      let preservesDirectSshContinuationGap = false
      let isRemoteRuntimeMirror = isRemoteRuntimePtyId(ptyId)
      set((s) => {
        const existingPtyIds = s.ptyIdsByTabId[tabId] ?? []
        const remainingPtyIds = ptyId ? existingPtyIds.filter((id) => id !== ptyId) : []
        const liveBinding = s.directSshLivePtyBindingByTabId[tabId]
        let nextTabsByWorktree = s.tabsByWorktree
        for (const [wId, tabs] of Object.entries(s.tabsByWorktree)) {
          const index = tabs.findIndex((t) => t.id === tabId)
          if (index === -1) {
            continue
          }
          worktreeId = wId
          const tab = tabs[index]
          if (getPendingActivationSpawnCount(tab.pendingActivationSpawn) > 0) {
            wasActivationSpawn = true
          }
          if (!ptyId) {
            isRemoteRuntimeMirror =
              existingPtyIds.length > 0 && existingPtyIds.every((id) => isRemoteRuntimePtyId(id))
          }
          // Why: consume pendingActivationSpawn on real activation clears, but keep it when clearing a stale wake-hint id — its fallback spawn still needs the suppression.
          const { pendingActivationSpawn: _unused, ...rest } = tab
          void _unused
          const nextTabPtyId = remainingPtyIds.at(-1) ?? null
          preservesDirectSshContinuationGap = Boolean(
            ptyId &&
            remainingPtyIds.length === 0 &&
            liveBinding?.ptyId === ptyId &&
            getPendingActivationSpawnCount(tab.pendingActivationSpawn) > 0 &&
            isCurrentDirectSshAuthority(s, liveBinding.authority)
          )
          const shouldRetainActivationSpawn =
            preservesDirectSshContinuationGap ||
            (wasActivationSpawn && ptyId != null && !existingPtyIds.includes(ptyId))
          const nextPendingActivationSpawn = shouldRetainActivationSpawn
            ? tab.pendingActivationSpawn
            : consumePendingActivationSpawn(tab.pendingActivationSpawn)
          if (tab.pendingActivationSpawn || tab.ptyId !== nextTabPtyId) {
            const nextTabs = [...tabs]
            nextTabs[index] = {
              ...rest,
              ...(nextPendingActivationSpawn
                ? { pendingActivationSpawn: nextPendingActivationSpawn }
                : {}),
              ptyId: nextTabPtyId
            }
            nextTabsByWorktree = { ...s.tabsByWorktree, [wId]: nextTabs }
          }
          break
        }
        const nextPtyIdsByTabId = { ...s.ptyIdsByTabId }
        if (worktreeId) {
          nextPtyIdsByTabId[tabId] = remainingPtyIds
        } else {
          // Why: repo purge can retire the owning tab before its async exit arrives; don't resurrect an orphan PTY index.
          delete nextPtyIdsByTabId[tabId]
        }
        const nextPendingCodexPaneRestartIds = { ...s.pendingCodexPaneRestartIds }
        const nextCodexRestartNoticeByPtyId = { ...s.codexRestartNoticeByPtyId }
        if (ptyId) {
          delete nextPendingCodexPaneRestartIds[ptyId]
          delete nextCodexRestartNoticeByPtyId[ptyId]
        } else {
          for (const currentPtyId of s.ptyIdsByTabId[tabId] ?? []) {
            delete nextPendingCodexPaneRestartIds[currentPtyId]
            delete nextCodexRestartNoticeByPtyId[currentPtyId]
          }
        }
        // Why: an explicit exit drops the dead relay ID; bulk clears retain it for relay grace.
        const nextLastKnownRelay = { ...s.lastKnownRelayPtyIdByTabId }
        if (ptyId && nextLastKnownRelay[tabId] === ptyId) {
          // Why: the relay slot holds ONE id per tab (the last pane to bind). If
          // that pane exits, promote a surviving pane instead of clearing — else the
          // survivor is left visible only in the layout leaf map, and a later
          // relay-drop bulk-clear lets the orphan sweep delete the still-live tab
          // (the orphan predicate reads this map but not layout leaves) (#9911).
          const survivingPtyId = remainingPtyIds.at(-1)
          if (survivingPtyId) {
            nextLastKnownRelay[tabId] = survivingPtyId
          } else {
            delete nextLastKnownRelay[tabId]
          }
        }
        let nextDirectSshPaneRetryByTabId = s.directSshPaneRetryByTabId
        const pendingRetry = s.directSshPaneRetryByTabId[tabId]
        if (
          pendingRetry &&
          (!ptyId ||
            (existingPtyIds.includes(ptyId) &&
              parseAppSshPtyId(ptyId)?.connectionId === pendingRetry.authority.targetId))
        ) {
          nextDirectSshPaneRetryByTabId = { ...s.directSshPaneRetryByTabId }
          delete nextDirectSshPaneRetryByTabId[tabId]
        }
        let nextDirectSshLivePtyBindingByTabId = s.directSshLivePtyBindingByTabId
        if (liveBinding && (!ptyId || liveBinding.ptyId === ptyId)) {
          nextDirectSshLivePtyBindingByTabId = {
            ...s.directSshLivePtyBindingByTabId
          }
          const promotedPtyId = ptyId ? remainingPtyIds.at(-1) : undefined
          if (
            promotedPtyId &&
            parseAppSshPtyId(promotedPtyId)?.connectionId === liveBinding.authority.targetId &&
            isCurrentDirectSshAuthority(s, liveBinding.authority)
          ) {
            nextDirectSshLivePtyBindingByTabId[tabId] = {
              ...liveBinding,
              ptyId: promotedPtyId
            }
          } else if (!preservesDirectSshContinuationGap) {
            delete nextDirectSshLivePtyBindingByTabId[tabId]
          }
        }
        return {
          ...(nextTabsByWorktree !== s.tabsByWorktree
            ? { tabsByWorktree: nextTabsByWorktree }
            : {}),
          ptyIdsByTabId: nextPtyIdsByTabId,
          lastKnownRelayPtyIdByTabId: nextLastKnownRelay,
          pendingCodexPaneRestartIds: nextPendingCodexPaneRestartIds,
          codexRestartNoticeByPtyId: nextCodexRestartNoticeByPtyId,
          directSshPaneRetryByTabId: nextDirectSshPaneRetryByTabId,
          directSshLivePtyBindingByTabId: nextDirectSshLivePtyBindingByTabId
        }
      })
      // Bump activity on PTY exit, but skip intentional shutdowns (suppressed exits) and click-driven pane unmounts (pendingActivationSpawn).
      if (
        worktreeId &&
        !wasActivationSpawn &&
        !isRemoteRuntimeMirror &&
        !hasWorktreeSleepIntent(worktreeId) &&
        !(ptyId && get().suppressedPtyExitIds[ptyId])
      ) {
        get().bumpWorktreeActivity(worktreeId)
      }
    }
  }
}
