/**
 * Fork: resolves what the pane-corner badge may claim about a running agent.
 *
 * Three sources, strongest first, because they carry different proof:
 *  - the agent's reported status row, refreshed every tool-use hook (model AND
 *    effort). This tracks a mid-session `/model` or `/effort`, which nothing else does.
 *  - the Claude TUI's own header frame, printed once at startup and never redrawn —
 *    so it is stale the moment the user switches model, and only readable while it
 *    is still on screen. A fallback, never an override.
 *  - the persisted launch pick (what Orca asked for, never evidence about the CLI)
 *
 * `observed` says whether every displayed value came from one of the first two.
 * Codex's mid-session `/model` runs inside its own picker, so a Codex TUI pane
 * usually lands on the third source — truthful to show, but not a readback.
 */

import type { AgentType } from '../../../../shared/agent-status-types'
import {
  findCatalogModel,
  findCatalogOption,
  getAgentSessionOptionCatalog,
  type AgentSessionOptionCatalog,
  type CatalogModel
} from '../../../../shared/agent-session-option-catalog'
import type { PersistedNativeChatSessionOptions } from '../../../../shared/native-chat-session-options'
import { readClaudeSessionOptionsFromTerminalScreen } from '../native-chat/claude-terminal-session-options'

export type AgentModelBadgeReading = {
  modelLabel: string
  effortLabel: string | null
  /** False when any displayed value is a launch pick nothing has confirmed. */
  observed: boolean
}

export type AgentModelBadgeInput = {
  agent: AgentType
  /** `AgentStatusEntry.model` for this pane, when the agent reported one. */
  reportedModel?: string | undefined
  /** `AgentStatusEntry.effort` for this pane — the level the provider applied to
   *  the current turn, so it already reflects any silent downgrade. */
  reportedEffort?: string | undefined
  /** Serialized visible screen; only Claude's frame is parseable today. */
  screen?: string | null
  persisted?: PersistedNativeChatSessionOptions | undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function catalogEffortLabel(
  catalog: AgentSessionOptionCatalog,
  model: CatalogModel | undefined,
  effortId: string
): string | undefined {
  for (const candidate of [model, ...catalog.models]) {
    const kind = findCatalogOption(candidate, 'effort')?.kind
    if (kind?.type === 'select') {
      const label = kind.choices.find((choice) => choice.value === effortId)?.label
      if (label) {
        return label
      }
    }
  }
  return undefined
}

export function readAgentModelBadge(input: AgentModelBadgeInput): AgentModelBadgeReading | null {
  const catalog = getAgentSessionOptionCatalog(input.agent)
  if (!catalog) {
    return null
  }
  const screenValues =
    input.agent === 'claude'
      ? readClaudeSessionOptionsFromTerminalScreen(input.screen, catalog.models)
      : null
  const screenModel = stringValue(screenValues?.model)
  const screenEffort = stringValue(screenValues?.effort)
  const persistedForAgent = input.persisted?.[input.agent]

  const reportedModel = stringValue(input.reportedModel)
  const reportedEffort = stringValue(input.reportedEffort)
  const modelId = reportedModel ?? screenModel ?? stringValue(persistedForAgent?.model)
  if (!modelId) {
    return null
  }
  // The frame's effort belongs to the model the frame names. Once the session has
  // moved to another model, that pairing is void — showing it would put a level the
  // agent is not using next to the model it is.
  const frameEffort = screenModel === modelId ? screenEffort : undefined
  const effortId =
    reportedEffort ??
    frameEffort ??
    stringValue(persistedForAgent?.valuesByModel?.[modelId]?.['effort'])

  // Why search every model, not just the matched one: hooks report a display name
  // ("Opus 5"), which is not a catalog id, so the level would otherwise render as
  // the raw `xhigh` beside models that spell it "Extra high".
  const model = findCatalogModel(catalog, modelId)
  const effortLabel = effortId ? (catalogEffortLabel(catalog, model, effortId) ?? effortId) : null

  // An effort we never read back downgrades the whole pill: the pair is what a
  // launch resolves, so a confirmed model beside a guessed effort still misleads.
  const observed = Boolean(
    (reportedModel || screenModel) && (!effortId || reportedEffort || frameEffort)
  )
  return { modelLabel: model?.label ?? modelId, effortLabel, observed }
}
