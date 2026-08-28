import type { RepoIcon } from './repo-icon'
import type { GitHubRepositoryIdentity } from './github/pull-request-types'
import type { RepoHookSettings } from './orca-yaml-hook-types'
import type { ForkSyncMode } from './git-fork-sync'
import type { GitRemoteIdentity } from './git-remote-identity'
import type { RepoSourceControlAiOverrides } from './source-control-ai-types'
import type { RepoProjectHostSetupMethod } from './project-types'
import type { WorktreeFolder, WorktreeFolderStatusGroupingMode } from './worktree-folder/types'

// ─── Repo ────────────────────────────────────────────────────────────
export type RepoKind = 'git' | 'folder'

/**
 * Per-repo user choice for where issues are fetched and filed.
 *
 * Why three states, not two: storage must distinguish "user explicitly chose
 * upstream" from "heuristic happens to resolve to upstream right now." Collapsing
 * the two would let a remote-topology change (someone removes `upstream`, or
 * adds one later) silently move the effective source — the exact silent-source-
 * switch class the upstream-issue-source design rejects.
 *
 * - `'auto'` (or undefined): honor the heuristic in `getIssueOwnerRepo`
 *   (upstream-if-exists, else origin). Initial state for every repo.
 * - `'upstream'`: explicit upstream. Wins over heuristic and future topology
 *   changes. Falls back to origin if `upstream` remote vanishes, with a toast.
 * - `'origin'`: explicit origin. Same precedence.
 */
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

export type Repo = {
  id: string
  path: string
  displayName: string
  badgeColor: string
  repoIcon?: RepoIcon | null
  /** Set when the repo is a fork: the upstream/parent owner/repo. Drives the
   *  fork indicator and the default avatar of same-name forks (renamed forks
   *  keep their own owner). Absent = not a fork, or fork status not yet
   *  resolved. */
  upstream?: GitHubRepositoryIdentity | null
  addedAt: number
  kind?: RepoKind
  gitUsername?: string
  worktreeBaseRef?: string
  /** Optional repo-scoped workspace root override. Relative paths resolve from `path`. */
  worktreeBasePath?: string
  hookSettings?: RepoHookSettings
  /** SSH target ID for remote repos. null/undefined = local. */
  connectionId?: string | null
  /**
   * Explicit execution owner for this repo. Runtime-host repos need this
   * because they otherwise look identical to local repos (`connectionId: null`).
   */
  executionHostId?: 'local' | `ssh:${string}` | `runtime:${string}` | null
  /** Per-repo override for issue-source resolution. `undefined` is treated
   *  identically to `'auto'`; writers leave it undefined on creation so
   *  existing persisted records stay forward-compatible. */
  issueSourcePreference?: IssueSourcePreference
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
  /** Paths (relative to the primary checkout) that should be APFS clone-copied
   *  on macOS when possible, otherwise symlinked, into newly created worktrees.
   *  Undefined/empty means no shared paths are created for this repo. */
  symlinkPaths?: string[]
  /** Durable sidebar-only repo organization. Execution remains repo-scoped. */
  projectGroupId?: string | null
  /** User-authored ordering inside the project group or ungrouped bucket. */
  projectGroupOrder?: number
  /** Repo-specific source-control AI overrides. Missing fields inherit global settings. */
  sourceControlAi?: RepoSourceControlAiOverrides
  /** Transitional source for ProjectHostSetup.setupMethod while Repo remains compatibility storage. */
  projectHostSetupMethod?: RepoProjectHostSetupMethod
}

/**
 * Envelope returned by the `repos:getBaseRefDefault` IPC handler.
 *
 * Why: declared in `shared/` rather than colocated with the handler so the
 * preload bridge and renderer can import the same named type. Before this
 * lived in `src/main/git/repo.ts` — the preload layer cannot import from
 * `src/main/`, which forced three sites to inline the same structural shape
 * and risk silent drift.
 *
 * Why `remoteCount`: BaseRefPicker renders a multi-remote hint when the repo
 * has more than one configured remote; piggybacking the count on this IPC
 * avoids a second round-trip.
 *
 * Why `defaultBaseRef` (not `default`): `default` is a reserved word and is
 * awkward to destructure.
 */
export type BaseRefDefaultResult = {
  defaultBaseRef: string | null
  remoteCount: number
}

export type BaseRefSearchResult = {
  refName: string
  localBranchName: string
}
