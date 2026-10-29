import type { RepoIcon } from './repo-icon'
import type { GhAccountBinding } from './github/account-binding'
import type { GitHubRepositoryIdentity } from './github/pull-request-types'
import type { RepoHookSettings } from './orca-yaml-hook-types'
import type { ForkSyncMode } from './git-fork-sync'
import type { GitRemoteIdentity } from './git-remote-identity'
import type { RepoSourceControlAiOverrides } from './source-control-ai-types'
import type { RepoProjectHostSetupMethod } from './project-types'
import type { WorktreeFolder, WorktreeFolderStatusGroupingMode } from './worktree-folder/types'
import type { JiraProjectReference } from './jira/jira-project-reference'
import type { OrcadRetainedMarker } from './orcad-retained-marker'

export type RepoKind = 'git' | 'folder'

/** Explicit choices survive remote-topology changes; absent/auto uses upstream when present, otherwise origin.
 * Explicit upstream falls back to origin with a toast if that remote vanishes. */
export type IssueSourcePreference = 'upstream' | 'origin' | 'auto'
export type ExternalWorktreeVisibility = 'hide' | 'show'

export type BuiltInWorktreeVisibilitySourceId = 'claude' | 'gsd'

export type CustomWorktreeVisibilitySource = {
  id: string
  rootPath: string
}

/**
 * Fork: how — if at all — a sidebar worktree row echoes its Unity colour.
 * `'bar'` is a left edge stripe, `'wash'` tints the whole row background,
 * `'chip'` is a colour chip on the right.
 */
export type UnitySidebarTintMode = 'off' | 'bar' | 'wash' | 'chip'

const UNITY_SIDEBAR_TINT_MODES: readonly UnitySidebarTintMode[] = ['off', 'bar', 'wash', 'chip']

/** Reads the persisted setting, including records written when it was a boolean. */
export function resolveUnitySidebarTintMode(value: unknown): UnitySidebarTintMode {
  // The boolean era was a show/hide toggle, so both of its values carry real
  // intent and must survive the default flip — `false` meant "don't show".
  if (typeof value === 'boolean') {
    return value ? 'bar' : 'off'
  }
  if (
    typeof value === 'string' &&
    (UNITY_SIDEBAR_TINT_MODES as readonly string[]).includes(value)
  ) {
    return value as UnitySidebarTintMode
  }
  // Absent = never chosen, which is now the bar. Unreadable values land here
  // too: they hold no intent either, and a repo showing the default is far
  // easier to spot and correct than one silently stuck off.
  return 'bar'
}

export type WorktreeVisibilitySourcePreferences = {
  builtIn?: Partial<Record<BuiltInWorktreeVisibilitySourceId, ExternalWorktreeVisibility>>
  custom?: Record<string, ExternalWorktreeVisibility>
}

export type WorktreeVisibilityDefaults = {
  /** Default for worktrees outside a recognized source. */
  external?: ExternalWorktreeVisibility
  /** Host-owned roots applied to every repository on that host. */
  customSources?: CustomWorktreeVisibilitySource[]
  /** Defaults for built-in and host-owned custom sources. */
  sourcePreferences?: WorktreeVisibilitySourcePreferences
}

export type Repo = {
  id: string
  path: string
  displayName: string
  badgeColor: string
  repoIcon?: RepoIcon | null
  /** Fork parent; same-name forks use its avatar, renamed forks keep their own. Absent means non-fork or unresolved. */
  upstream?: GitHubRepositoryIdentity | null
  addedAt: number
  kind?: RepoKind
  /** Git root proven during folder upgrade; keeps the original checkout locator stable. */
  folderUpgradeGitRootPath?: string
  gitUsername?: string
  worktreeBaseRef?: string
  /** Optional repo-scoped workspace root override. Relative paths resolve from `path`. */
  worktreeBasePath?: string
  hookSettings?: RepoHookSettings
  /** SSH target ID for remote repos. null/undefined = local. */
  connectionId?: string | null
  /** Runtime-host repos otherwise resemble local repos (connectionId: null); retain their explicit execution owner. */
  executionHostId?: 'local' | `ssh:${string}` | `runtime:${string}` | null
  /** Absent means auto; writers omit on creation for persisted-record compatibility. */
  issueSourcePreference?: IssueSourcePreference
  /** Host-owned Jira project default; users can override it in each composer. */
  defaultJiraProject?: JiraProjectReference | null
  /** Bind host/login only; resolve a short-lived gh token at spawn and inject into that child’s environment. */
  ghAccount?: GhAccountBinding
  /** Controls Orca's fork-default-branch sync offer for repos with upstream metadata. */
  forkSyncMode?: ForkSyncMode
  /** Canonical identity for the repo remote Orca should use for provider-level grouping. */
  gitRemoteIdentity?: GitRemoteIdentity | null
  /** Controls whether worktrees Orca did not create appear in the sidebar. */
  externalWorktreeVisibility?: ExternalWorktreeVisibility
  /** True when the repo predates hidden-by-default external worktrees. */
  externalWorktreeVisibilityLegacy?: boolean
  /** One-shot guard for the optional existing-user visibility prompt. */
  externalWorktreeVisibilityPromptDismissedAt?: number
  /** Hidden external worktree paths acknowledged by Keep hidden on the inbox. */
  externalWorktreeInboxBaselinePaths?: string[]
  /** Fork feature: copy the default checkout's Unity Library into every new
   *  worktree. undefined = not decided yet (the renderer asks once). */
  unityAutoSeedCache?: boolean
  /** Fork: give each worktree a distinct colour in the Unity toolbar.
   *  Undefined means ON — only an explicit false turns it off. */
  unityWorktreeTint?: boolean
  /** Fork: how the Unity worktree colour is echoed on the sidebar row. Undefined
   *  means `'bar'` — only an explicit `'off'` opts out, and the renderer gates
   *  the whole thing on the repo actually being a Unity project. Read through
   *  `resolveUnitySidebarTintMode`: records predating the four-way choice hold a
   *  boolean. */
  unityTintInSidebar?: UnitySidebarTintMode
  /** Fork: manual tint choices from the worktree context menu, keyed by the
   *  worktree FOLDER name (the colour follows the folder, like the automatic
   *  assignment). Absent labels fall back to the automatic palette. Values are
   *  `#rrggbb`, or the reserved `UNITY_TINT_OPT_OUT` (`'none'`) for a worktree
   *  that gets no colour at all — test it with `isUnityTintOptOut`, never by
   *  comparing to a literal. */
  unityTintOverrides?: Record<string, string>
  /** Fork: virtual folders this project's worktrees can be filed under. Absent
   *  and empty both mean "no folders" — there is no third, unknown state.
   *  Membership lives on `WorktreeMeta.worktreeFolderId`, never as an id list
   *  here, so it survives a rename and a default-worktree switch. Read through
   *  `resolveWorktreeFolderTree`, never by walking `parentFolderId` directly. */
  worktreeFolders?: WorktreeFolder[]
  /** Fork: what folders do under workspace-status / pr-status grouping, where
   *  members scatter into lanes. Undefined means `'hide'` — read through
   *  `resolveWorktreeFolderStatusGrouping`. */
  worktreeFolderStatusGrouping?: WorktreeFolderStatusGroupingMode
  /** External worktree paths explicitly imported while global visibility stays hide. */
  importedExternalWorktreePaths?: string[]
  /** Opt-in repo policy for coding-agent scratch worktrees; absent means hide. */
  agentWorktreeVisibility?: ExternalWorktreeVisibility
  /** User-defined roots classified independently from ordinary external worktrees. */
  customWorktreeVisibilitySources?: CustomWorktreeVisibilitySource[]
  /** Per-source visibility; absent built-ins inherit the legacy agent policy. */
  worktreeVisibilitySourcePreferences?: WorktreeVisibilitySourcePreferences
  /** User permanently opted out of the new-external-worktree inbox for this repo. */
  externalWorktreeDiscoverySuppressedAt?: number
  /** Relative paths to APFS-clone on macOS when possible, otherwise symlink, into new worktrees. Absent/empty creates none. */
  symlinkPaths?: string[]
  /** Durable sidebar-only repo organization. Execution remains repo-scoped. */
  projectGroupId?: string | null
  /** User-authored ordering inside the project group or ungrouped bucket. */
  projectGroupOrder?: number
  /** Repo-specific source-control AI overrides. Missing fields inherit global settings. */
  sourceControlAi?: RepoSourceControlAiOverrides
  /** Transitional source for ProjectHostSetup.setupMethod while Repo remains compatibility storage. */
  projectHostSetupMethod?: RepoProjectHostSetupMethod
  /** Local row a WSL host now owns, kept for a downgrade; set only by the mover's retention pass. */
  orcadRetained?: OrcadRetainedMarker
}

/** Shared IPC shape for repos:getBaseRefDefault across main/preload/renderer; remoteCount avoids a second hint lookup. */
export type BaseRefDefaultResult = {
  defaultBaseRef: string | null
  remoteCount: number
  /** This stopped (or unverifiable) WSL distro refused the read (E9); re-ask once it runs. */
  refusedWslDistro?: string
}

export type BaseRefSearchResult = {
  refName: string
  localBranchName: string
}
