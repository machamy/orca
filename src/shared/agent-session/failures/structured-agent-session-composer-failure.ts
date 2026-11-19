// One English table for composer command refusals: `error` stays English, desktop translates by code.
export const STRUCTURED_COMPOSER_FAILURE_COPY = {
  goalObjectiveMissing: 'Describe the goal after /goal.',
  commandUnavailable:
    '/{{name}} is not available in chat sessions. Use the slash menu to see available commands.',
  commandTakesNoArguments: 'Use /{{name}} without arguments.',
  commandUnsupportedByHost: '/{{name}} is not supported by this chat host.',
  modelPickerFailed: 'Could not open the model picker.',
  effortPickerFailed: 'Could not open the effort picker.',
  modelApplyFailed: 'Could not apply model {{value}}.',
  effortApplyFailed: 'Could not apply effort {{value}}.',
  shellCommandWorking: 'Wait for the response to finish, then run the shell command.',
  shellCommandNotOpen: 'Open this chat again, then run the shell command.',
  shellCommandFolderUnavailable:
    "This chat's folder is unavailable, so the shell command did not run.",
  shellCommandUnsupportedByHost:
    'This chat host cannot run ! shell commands. Update Orca on that host.',
  shellCommandFailed: 'The shell command could not run.'
} as const

export type StructuredComposerFailureCode = keyof typeof STRUCTURED_COMPOSER_FAILURE_COPY

export type StructuredComposerFailureParams = { name?: string; value?: string }

export function structuredComposerFailure(
  errorCode: StructuredComposerFailureCode,
  errorParams?: StructuredComposerFailureParams
): {
  error: string
  errorCode: StructuredComposerFailureCode
  errorParams?: StructuredComposerFailureParams
} {
  // One pass so a value containing "{{name}}" stays verbatim.
  const error = STRUCTURED_COMPOSER_FAILURE_COPY[errorCode].replace(
    /\{\{(name|value)\}\}/g,
    (_slot, slot: 'name' | 'value') => errorParams?.[slot] ?? ''
  )
  return { error, errorCode, ...(errorParams ? { errorParams } : {}) }
}
