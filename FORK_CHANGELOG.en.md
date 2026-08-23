# machamy/orca — Fork changelog (English, secondary)

> **Canonical: [`FORK_CHANGELOG.md`](FORK_CHANGELOG.md) (Korean).** This English
> version is a translation of it; if they disagree, the Korean is authoritative.

A fork of [stablyai/orca](https://github.com/stablyai/orca) that loosely tracks
upstream and stacks its own changes as **revisions (rev)** on top. Each rev
records what it adds over upstream, with commit hashes so any build traces to
source.

## Version scheme

```
1.4.169-rc.0   .   machamy.1   .   local . <timestamp> . <commit12>
└─ upstream base   └─ fork rev    └─ local-build metadata
```

- **Upstream base**: `package.json` (upstream only moves it on `release:` commits).
- **Fork rev (`machamy.N`)**: the `FORK_VERSION` file at the repo root; bumped per
  fork milestone. When a newer upstream is merged, the base changes and the rev
  continues.
- The commit hash is baked into the filename and the packaged app's resources, so
  an installed build is traceable even without the filename.

---

## machamy.7 — upstream `1.4.178-rc.2` · 2026-08-22

**Pick a worktree's Unity toolbar colour by hand.** Right-click → Unity Toolbar
Color offers Automatic, the ten palette presets, and a custom picker; a colour
another worktree already wears is disabled and marked "(in use)", so two editors
can never share one. Choices persist per repo and apply immediately via a new
`unity:applyWorktreeTint` IPC — siblings whose automatic colour moved are
rewritten too, local ones only. Colour picking moved to a shared module so the
menu and the script writer cannot drift apart.

Also: **`pnpm test:fork`**, a one-command regression gate over every fork
feature, and a round of moving fork code off upstream files into separate
modules to shrink merge-conflict surface. Packaging now excludes `.claude/`,
which was shipping agent worktrees inside app.asar. Full details in the Korean
canonical changelog.

## machamy.3 — merged upstream `1.4.178-rc.2` · 2026-08-19

Merged 564 upstream commits (including a large module restructuring) and added
**Unity worktree support (macOS)** — right-click seed via APFS copy-on-write,
live-editor guards, ask-on-first-open, per-repo auto-copy toggle — and a
**Markdown GitHub-style view** for .md files whose raw HTML the preview blocks.
The fork's sleep signal was split into `retainSurface` to avoid colliding with
upstream's new use of `keepHistory`. Full details in the Korean canonical
[`FORK_CHANGELOG.md`](FORK_CHANGELOG.md) (machamy.2 and machamy.3 sections).

## machamy.2 — on upstream `1.4.176-rc.1` · 2026-08-09

State-preservation fixes for the default-worktree switch, all observed on a real
app: tab loss/duplication on swap, dead-session reattach, agent rows demoting to
terminal rows, permanent switch refusal after restart, Korean-name transcript
collisions. Added the "keep untracked files in place" option. See the Korean
canonical changelog for the full account.

## machamy.1 — on upstream `1.4.169-rc.0` (`5f187e083`) · 2026-08-06

Example local build: `1.4.169-rc.0.machamy.1.local.<ts>.cd3aacff7`

### Added
- **Make Default Worktree.** Promote a sub-worktree to the repo's default checkout
  by **swapping the two worktrees' branches in place** — the selected branch checks
  out at the repo path, the old default at the selected worktree. No directories
  move, so git's main worktree (the `.git` holder) stays at the repo path and
  GitHub Desktop pointed at the repo folder shows the promoted branch. Uncommitted
  + staged + untracked changes follow their branch; ignored files stay put. Drag a
  worktree onto the **Default** card, or `orca worktree default set --worktree <selector>`.
- **"Agents follow their branch" toggle** (default off). Sleeps both worktrees,
  swaps their slept session content + Claude transcripts, and resumes each agent
  where its branch now lives. git's main worktree still stays at the repo path;
  only sleep/resume-capable agents (Claude, Codex) follow.
- **"Tell agents what changed" toggle** (default off). Surfaces the branch/path
  change after a switch.

### Changed
- Sidebar **default/primary** signals — star badge, repo-group sort anchor, Cmd+J
  chip, hide-default-branch filter, hide-sleeping exemption, and delete/project-
  removal guards — now key on the **repo path**, not git's `isMainWorktree`, so the
  correct row reads as "default" after a switch (no more two "defaults").

### Fixed
- **Branch-swap data safety** (found via adversarial real-git testing):
  partial stash-capture no longer strands the first worktree's uncommitted work in
  a dangling stash; a non-zero post-checkout hook no longer leaves a worktree
  detached or a spurious `recovery_required`; mid-merge / cherry-pick / revert
  worktrees are rejected up front.
- **Packaged daemon-entry boot** retries a transient post-pack `dlopen` contention
  (`ETIMEDOUT`) instead of failing the whole macOS package.
- **Three "agents follow" fixes from real-use reports:**
  - No active workspace after the switch made followed agents fork into hidden
    background tabs — the promoted default is now activated before the wake.
  - The momentary detached HEAD from `git switch --detach` made JetBrains
    (Rider) drop its caches — a temporary park branch keeps HEAD symbolic.
  - **Root cause of terminals closing instead of moving:** daemon session ids
    embed the spawn-time worktree id; after the content swap the ownership check
    rejected the preserved id and bare-attached to the dead session — blank pane,
    tab auto-closed. Panes with a sleeping record now clear the stale binding and
    cold-restore `--resume` at the new path; live tabs' `startupCwd` is remapped;
    the follow wake mounts every slept agent tab (idle ones included) on both
    sides so the move is visible. (Cause confirmed 4x by a 21-agent adversarial
    review + a store-level simulation test.)

### Commits

> The history was squashed into one commit, so every hash below points at that
> single commit (`b4270893`). They used to be per-commit: the fork's 88 commits
> were rewritten because real project and branch names from a private repository
> had leaked into commit messages and test fixtures. The summary column is still
> the original commit subjects, so what landed when is still readable.

| hash | summary |
|------|---------|
| `b4270893` | feat(worktree): default-worktree switch with agent-safe hardening |
| `b4270893` | fix(build): retry packaged daemon-entry boot on post-pack dlopen contention |
| `b4270893` | fix(sidebar): key default-workspace UI on the repo path, not git isMainWorktree |
| `b4270893` | refactor(worktree): make default switch a branch swap, keeping git main in place |
| `b4270893` | fix(worktree): harden branch swap against data loss and stuck-state edge cases |
| `b4270893` | feat(worktree): add "agents follow" and "notify" toggles to default switch |
| `b4270893` | fix(worktree): surface followed agents and avoid detached HEAD on switch |
| `b4270893` | fix(worktree): resume followed agents after a default switch instead of closing their tabs |
| `b4270893` | fix(worktree): re-seed follow-switch sleeping records lost to swap-window churn |
| `b4270893` | fix(worktree): stop mounted panes from consuming follow-switch records at sleep |
| `b4270893` | fix(worktree): re-home open editor tabs when agents follow a default switch |
| `b4270893` | fix(worktree): carry every workspace window through the follow switch |
| `b4270893` | fix(worktree): codex follow support + remaining per-workspace state remaps |
| `b4270893` | feat(worktree): drive the full default-switch flow from the CLI (--follow-agents --ui-flow) |
| `b4270893` | fix(cli): register the default-switch booleans so --follow-agents actually transmits |
| `b4270893` | test(worktree): mode-B follow-switch E2E harness driving the live app via CLI |
| `b4270893` | fix(worktree): show followed agents in the sidebar immediately after a switch |
| `b4270893` | feat(worktree): show a moving-agents indicator during the default switch |

### Verification status
- **E2E-verified against the live app** (`config/scripts/mode-b-follow-e2e.mjs`,
  CLI-driven): claude+codex simultaneously, round-trip resume with the SAME
  provider sessions — 5 consecutive iterations (10 swaps) all green. Sidebar
  chips appear pre-hook (seeded from sleeping records); a "Moving agents…"
  spinner row covers the transition window.
- **Confirmed in real use**: editor file loading, Rider cache survival, sidebar
  visibility (visual).
- **Verified** (tests/simulation): full window preservation — terminal tabs +
  splits, open editor files + dirty buffers, browser tabs, file-tree expansion,
  reopen stacks, search panel, nav history, diff tabs — surviving restart (main
  persistence remap). Pane self-respawn during the swap is guarded; lost records
  re-seed from a snapshot.
- **Known residuals**: plain shell terminal tabs reopen fresh after a swap (a
  shell process cannot move); combined-diff/conflict-review tabs are excluded
  from the rekey (reopen them); a tiny mid-swap debounced-write race window.
- **Not implemented (as of this rev)**: auto-injecting the notify note into a live
  TUI agent's input (no safe, verifiable mechanism at the time). Implemented later
  in `b4270893` (2026-08-14) — see the correction under machamy.2 in the Korean
  canonical changelog for its scope and remaining limit.
- **Temporary diagnostics**: `mode_b_*`/`sleeping_record_delete`/`worktree_purge`
  breadcrumbs land in `main.trace.ndjson`; to be removed once confirmed.
