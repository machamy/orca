import {
  agentProviderSessionsEqual,
  type AgentProviderSessionMetadata,
  type ResumableTuiAgent,
  type SleepingAgentSessionRecord
} from '../../../../shared/agent-session-resume'

/**
 * Fork: a pane lost the resume claim — clear its record only if it names the
 * exact session the winner took; the record can name a different session than
 * the startup, and deleting that would destroy an unrelated session.
 */
export function shouldClearResumeClaimLoserRecord(
  resolved: { paneKey: string; record: SleepingAgentSessionRecord } | null,
  startup: { agent: ResumableTuiAgent; resumeProviderSession: AgentProviderSessionMetadata }
): string | null {
  if (
    resolved &&
    resolved.record.agent === startup.agent &&
    agentProviderSessionsEqual(
      startup.agent,
      resolved.record.providerSession,
      startup.resumeProviderSession
    )
  ) {
    return resolved.paneKey
  }
  return null
}
