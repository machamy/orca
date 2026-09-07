/**
 * Fork: resolves what the pane-corner badge may claim about a running agent.
 *
 * Three sources, strongest first, because they carry different proof:
 *  - the Claude TUI's own header frame (model *and* effort, read back off the screen)
 *  - the agent's reported status row (model only, sent by the agent's hook)
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
  getAgentSessionOptionCatalog
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
  /** Serialized visible screen; only Claude's frame is parseable today. */
  screen?: string | null
  persisted?: PersistedNativeChatSessionOptions | undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
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

  const modelId =
    screenModel ?? stringValue(input.reportedModel) ?? stringValue(persistedForAgent?.model)
  if (!modelId) {
    return null
  }
  const effortId =
    screenEffort ?? stringValue(persistedForAgent?.valuesByModel?.[modelId]?.['effort'])

  const model = findCatalogModel(catalog, modelId)
  const effortChoices = findCatalogOption(model, 'effort')?.kind
  const effortLabel = effortId
    ? ((effortChoices?.type === 'select'
        ? effortChoices.choices.find((choice) => choice.value === effortId)?.label
        : undefined) ?? effortId)
    : null

  // An effort we never read back downgrades the whole pill: the pair is what a
  // launch resolves, so a confirmed model beside a guessed effort still misleads.
  const observed = Boolean((screenModel || input.reportedModel) && (!effortId || screenEffort))
  return { modelLabel: model?.label ?? modelId, effortLabel, observed }
}
