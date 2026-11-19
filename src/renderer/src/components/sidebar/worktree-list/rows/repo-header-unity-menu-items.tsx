import React from 'react'
import { Palette } from 'lucide-react'
import { useAppStore } from '@/store'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import {
  resolveUnitySidebarTintMode,
  type Repo,
  type UnitySidebarTintMode
} from '../../../../../../shared/repository/repo-types'
import { isLocallyRunnableUnityRepo } from '../../../../../../shared/unity-repo-eligibility'

/** Fork: the project menu's Unity settings, gated on the same predicate the
 *  tint hook and the worktree menu use so no option goes unhonoured. */
export function RepoHeaderUnityMenuItems({ repo }: { repo: Repo }): React.JSX.Element | null {
  if (!isLocallyRunnableUnityRepo(repo)) {
    return null
  }
  return (
    <>
      <UnityAutoSeedToggleItem repo={repo} />
      <UnityTintToggleItem repo={repo} />
      <UnityTintInSidebarModeItem repo={repo} />
    </>
  )
}

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

/** Fork feature: opt this repo's new worktrees into automatic Unity cache
 *  seeding. The first eligible creation also asks via a toast; either surface
 *  writes the same per-repo setting. */
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
