import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '../../../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../../ui/dialog'
import { Input } from '../../../ui/input'
import { Label } from '../../../ui/label'
import type { AccountsPaneSectionModel } from '../accounts-pane-types'

/** Fork: adds an Anthropic API key or `claude setup-token` OAuth token as a switchable Claude account. */
export function ClaudeApiKeyAccountButton({
  model,
  disabled
}: {
  model: Pick<
    AccountsPaneSectionModel,
    'accountRuntime' | 'isRemoteAccountScope' | 'runClaudeAccountAction'
  >
  disabled: boolean
}): React.JSX.Element | null {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const canSave = label.trim().length > 0 && apiKey.trim().length > 0
  // The key is stored on this device, so remote owners and WSL distros keep using sign-in.
  if (model.isRemoteAccountScope || model.accountRuntime.runtime !== 'host') {
    return null
  }

  const close = (): void => {
    setOpen(false)
    setLabel('')
    setApiKey('')
  }

  return (
    <>
      <Button
        variant="outline"
        size="xs"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <KeyRound className="size-3" />
        {t('accounts.claude.apiKey.add', 'Add API key or token')}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('accounts.claude.apiKey.title', 'Add a Claude API key or OAuth token')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'accounts.claude.apiKey.description',
                'Paste an Anthropic API key or a token from `claude setup-token`. An API key bills its Console organization and stays in this device’s keychain. An OAuth token uses its Claude subscription and is saved in this account’s own Claude settings file, readable only by you.'
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!canSave) {
                return
              }
              const account = { label, apiKey }
              close()
              void model.runClaudeAccountAction('adding', () =>
                window.api.claudeAccounts.addApiKey(account)
              )
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="claude-api-key-label">
                {t('accounts.claude.apiKey.label', 'Name')}
              </Label>
              <Input
                id="claude-api-key-label"
                value={label}
                maxLength={60}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t('accounts.claude.apiKey.labelPlaceholder', 'Team API key')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claude-api-key-value">
                {t('accounts.claude.apiKey.key', 'API key or OAuth token')}
              </Label>
              <Input
                id="claude-api-key-value"
                type="password"
                value={apiKey}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-ant-…"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={close}>
                {t('auto.components.settings.AccountsPane.dbb9626ed1', 'Cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={!canSave}>
                {t('auto.components.settings.AccountsPane.590a3130f9', 'Save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Fork: a pasted-credential account's second line names the credential instead of a sign-in time. */
export function claudeApiKeyAccountDetail(
  account: { authMethod: string; apiKeyHint?: string },
  t: (key: string, fallback: string, values?: Record<string, string>) => string
): string | null {
  const values = { value0: account.apiKeyHint ?? '' }
  if (account.authMethod === 'oauth-token') {
    return t('accounts.claude.apiKey.tokenRow', 'OAuth token · …{{value0}}', values)
  }
  return account.authMethod === 'api-key'
    ? t('accounts.claude.apiKey.row', 'API key · …{{value0}}', values)
    : null
}
