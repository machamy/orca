import React from 'react'
import { useAppStore } from '@/store'
import {
  CircleX,
  Ellipsis,
  Eye,
  FolderInput,
  FolderPlus,
  Palette,
  Plus,
  Shapes,
  SlidersHorizontal,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenuCheckboxItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { getRepositoryIconSectionId } from '@/components/settings/repository-settings-targets'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import type { Repo, UnitySidebarTintMode } from '../../../../../../shared/repo-types'
import { resolveUnitySidebarTintMode } from '../../../../../../shared/repo-types'
import type { WorktreeVisibilityDefaults } from '../../../../../../shared/global-settings-types'
import { isGitRepoKind } from '../../../../../../shared/repo-kind'
import { isLocallyRunnableUnityRepo } from '../../../../../../shared/unity-repo-eligibility'
import {
  effectiveExternalWorktreeVisibility,
  isLegacyRepoForExternalWorktreeVisibility
} from '../../../../../../shared/worktree/ownership'
import {
  REPO_HEADER_ACTION_BUTTON_CLASS,
  REPO_HEADER_ACTION_REVEAL_CLASS
} from '../../repo-header-action-button-class'
import type { getRepoHeaderCreateState } from '../../repo-header-create-state'
import {
  handleRepoHeaderActionPointerDown,
  stopRepoHeaderKeyboardToggle,
  stopRepoHeaderMenuEvent
} from './header-event-guards'

function getWorktreeVisibilityMenuLabel(
  repo: Repo,
  visibilityDefaults?: WorktreeVisibilityDefaults
): string {
  const visibility = effectiveExternalWorktreeVisibility(
    repo,
    isLegacyRepoForExternalWorktreeVisibility(repo),
    visibilityDefaults
  )
  return visibility === 'show' ? 'Hide non-Orca worktrees' : 'Show hidden worktrees'
}

export type RepoHeaderProjectActions = {
  getWorktreeVisibilityDefaults: (repo: Repo) => WorktreeVisibilityDefaults | undefined
  onOpenRepoSettings: (projectId: string, sectionId?: string) => void
  onOpenWorktreeVisibility: (repo: Repo) => void
  onCreateGroupFromRepo: (repo: Repo) => void
  onMoveProjectToGroup: (repo: Repo, groupId: string) => void
  onRemoveProjectFromGroup: (repo: Repo) => void
  onRemoveProject: (repo: Repo) => void
  onCreateForRepo: (projectId: string) => void
}

export function RepoHeaderProjectActionsMenu({
  repo,
  label,
  projectGroups,
  actions
}: {
  repo: Repo
  label: string
  projectGroups: readonly ProjectGroup[]
  actions: RepoHeaderProjectActions
}): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className={REPO_HEADER_ACTION_BUTTON_CLASS}
              data-repo-header-action=""
              aria-label={translate(
                'auto.components.sidebar.WorktreeList.609633a9e6',
                'Project actions for {{value0}}',
                { value0: label }
              )}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={stopRepoHeaderKeyboardToggle}
              onPointerDown={handleRepoHeaderActionPointerDown}
            >
              <Ellipsis className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {translate('auto.components.sidebar.WorktreeList.2ef41bf9a7', 'Project actions')}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={6}
        // Why: Radix portals keep React bubbling through the project header; block menu events from arming row drag/collapse.
        onPointerDown={stopRepoHeaderMenuEvent}
        onMouseDown={stopRepoHeaderMenuEvent}
        onPointerUp={stopRepoHeaderMenuEvent}
        onMouseUp={stopRepoHeaderMenuEvent}
        onClick={stopRepoHeaderMenuEvent}
        onKeyDown={stopRepoHeaderMenuEvent}
      >
        <DropdownMenuItem onSelect={() => actions.onOpenRepoSettings(repo.id)}>
          <SlidersHorizontal className="size-3.5" />
          {translate('auto.components.sidebar.WorktreeList.2cdffbc728', 'Project Settings')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => actions.onOpenRepoSettings(repo.id, getRepositoryIconSectionId(repo.id))}
        >
          <Shapes className="size-3.5" />
          {translate('auto.components.sidebar.WorktreeList.e82d3589a1', 'Change Project Icon')}
        </DropdownMenuItem>
        {/* The same predicate the tint hook and the worktree menu gate on, or
            this settings block offers Unity options no surface will honour. */}
        {isLocallyRunnableUnityRepo(repo) ? (
          <>
            <UnityAutoSeedToggleItem repo={repo} />
            <UnityTintToggleItem repo={repo} />
            <UnityTintInSidebarModeItem repo={repo} />
          </>
        ) : null}
        {isGitRepoKind(repo) ? (
          <DropdownMenuItem onSelect={() => actions.onOpenWorktreeVisibility(repo)}>
            <Eye className="size-3.5" />
            {getWorktreeVisibilityMenuLabel(repo, actions.getWorktreeVisibilityDefaults(repo))}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => actions.onCreateGroupFromRepo(repo)}>
          <FolderPlus className="size-3.5" />
          {translate('auto.components.sidebar.WorktreeList.cbfd565f83', 'New group from project')}
        </DropdownMenuItem>
        {projectGroups.length > 0 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput className="size-3.5" />
              {translate('auto.components.sidebar.WorktreeList.4a08fb55f2', 'Move to group')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {projectGroups.map((group) => (
                <DropdownMenuItem
                  key={group.id}
                  disabled={repo.projectGroupId === group.id}
                  onSelect={() => actions.onMoveProjectToGroup(repo, group.id)}
                >
                  <span className="max-w-48 truncate">{group.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {repo.projectGroupId ? (
          <DropdownMenuItem onSelect={() => actions.onRemoveProjectFromGroup(repo)}>
            <CircleX className="size-3.5" />
            {translate('auto.components.sidebar.WorktreeList.64e55f7f01', 'Remove from group')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => actions.onRemoveProject(repo)}>
          <Trash2 className="size-3.5" />
          {translate('auto.components.sidebar.WorktreeList.c83968f87f', 'Remove Project')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function RepoHeaderCreateWorkspaceButton({
  repo,
  label,
  createState,
  onCreateForRepo
}: {
  repo: Repo
  label: string
  createState: ReturnType<typeof getRepoHeaderCreateState> | null
  onCreateForRepo: (projectId: string) => void
}): React.JSX.Element {
  const fallbackLabel = translate(
    'auto.components.sidebar.WorktreeList.bb85cd86ba',
    'Create workspace for {{value0}}',
    { value0: label }
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {createState?.disabled ? (
          <span
            className={cn(
              'inline-flex cursor-not-allowed transition-[margin,max-width,opacity]',
              REPO_HEADER_ACTION_REVEAL_CLASS
            )}
            data-repo-header-action=""
            tabIndex={0}
            aria-label={createState.ariaLabel}
            onKeyDown={stopRepoHeaderKeyboardToggle}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={handleRepoHeaderActionPointerDown}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="pointer-events-none size-5 shrink-0 rounded-md text-muted-foreground transition-opacity opacity-60"
              aria-label={createState.ariaLabel}
              disabled
            >
              <Plus className="size-3" />
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={REPO_HEADER_ACTION_BUTTON_CLASS}
            data-repo-header-action=""
            aria-label={createState?.ariaLabel ?? fallbackLabel}
            onKeyDown={stopRepoHeaderKeyboardToggle}
            onPointerDown={handleRepoHeaderActionPointerDown}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onCreateForRepo(repo.id)
            }}
          >
            <Plus className="size-3" />
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {createState?.tooltip ?? fallbackLabel}
      </TooltipContent>
    </Tooltip>
  )
}

/** Fork feature: opt this repo's new worktrees into automatic Unity cache
 *  seeding. The first eligible creation also asks via a toast; either surface
 *  writes the same per-repo setting. */
/** Fork: a generated (gitignored) editor script paints each worktree's colour
 *  chip into Unity's main toolbar, so two open editors are told apart at a glance.
 *  Applied on the next seed or Orca-launched open; unchecking removes it there. */
function UnityTintToggleItem({ repo }: { repo: Repo }): React.JSX.Element {
  const updateRepo = useAppStore((store) => store.updateRepo)
  return (
    <DropdownMenuCheckboxItem
      checked={repo.unityWorktreeTint !== false}
      onSelect={(event) => {
        event.preventDefault()
        // Default-on: only an explicit false opts out.
        void updateRepo(repo.id, { unityWorktreeTint: repo.unityWorktreeTint === false })
      }}
    >
      {translate(
        'auto.components.sidebar.WorktreeList.unityTintToggle',
        'Colour each Unity worktree differently'
      )}
    </DropdownMenuCheckboxItem>
  )
}

const UNITY_TINT_LABEL_NS = 'auto.components.sidebar.WorktreeList'

const UNITY_SIDEBAR_TINT_OPTIONS: readonly {
  mode: UnitySidebarTintMode
  labelKey: string
  labelFallback: string
}[] = [
  { mode: 'off', labelKey: `${UNITY_TINT_LABEL_NS}.unityTintInSidebarOff`, labelFallback: 'Off' },
  {
    mode: 'bar',
    labelKey: `${UNITY_TINT_LABEL_NS}.unityTintInSidebarBar`,
    labelFallback: 'Left colour bar'
  },
  {
    mode: 'wash',
    labelKey: `${UNITY_TINT_LABEL_NS}.unityTintInSidebarWash`,
    labelFallback: 'Row background tint'
  },
  {
    mode: 'chip',
    labelKey: `${UNITY_TINT_LABEL_NS}.unityTintInSidebarChip`,
    labelFallback: 'Right colour chip'
  }
]

/** Fork: echo that same worktree colour on the sidebar row. Defaults to the bar
 *  and is gated on the repo being a Unity project, so the sidebar stays plain
 *  for every project the tint would mean nothing in; the shape is a choice
 *  because each reads very differently at sidebar width. Hovering an option
 *  previews it on the live rows. */
function UnityTintInSidebarModeItem({ repo }: { repo: Repo }): React.JSX.Element {
  const updateRepo = useAppStore((store) => store.updateRepo)
  const setPreview = useAppStore((store) => store.setUnityTintSidebarPreview)
  const mode = resolveUnitySidebarTintMode(repo.unityTintInSidebar)
  // The root menu can unmount the submenu without ever reporting a close.
  React.useEffect(() => () => setPreview(repo.id, null), [repo.id, setPreview])
  return (
    <DropdownMenuSub
      onOpenChange={(open) => {
        if (!open) {
          setPreview(repo.id, null)
        }
      }}
    >
      <DropdownMenuSubTrigger>
        <Palette className="size-3.5" />
        {translate(
          'auto.components.sidebar.WorktreeList.unityTintInSidebarMode',
          'Unity colour in the sidebar'
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent onPointerLeave={() => setPreview(repo.id, null)}>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(next) => {
            setPreview(repo.id, null)
            void updateRepo(repo.id, {
              unityTintInSidebar: resolveUnitySidebarTintMode(next)
            })
          }}
        >
          {UNITY_SIDEBAR_TINT_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option.mode}
              value={option.mode}
              onPointerEnter={() => setPreview(repo.id, option.mode)}
              onFocus={() => setPreview(repo.id, option.mode)}
            >
              {translate(option.labelKey, option.labelFallback)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function UnityAutoSeedToggleItem({ repo }: { repo: Repo }): React.JSX.Element {
  const updateRepo = useAppStore((store) => store.updateRepo)
  return (
    <DropdownMenuCheckboxItem
      checked={repo.unityAutoSeedCache === true}
      onSelect={(event) => {
        // A toggle should not dismiss the menu it lives in.
        event.preventDefault()
        void updateRepo(repo.id, { unityAutoSeedCache: repo.unityAutoSeedCache !== true })
      }}
    >
      {translate(
        'auto.components.sidebar.WorktreeList.unityAutoSeedToggle',
        'Auto-copy Unity cache into new worktrees'
      )}
    </DropdownMenuCheckboxItem>
  )
}
