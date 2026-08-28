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

## machamy.8 — on upstream `1.4.178-rc.2` · 2026-08-28

A revision about how documents and Unity get *opened*. Markdown that used to render
as raw source in the embedded browser now opens in the editor's rich view, documents
with `<details>` folds keep rich mode, an already-running Unity is brought to the
front instead of launched twice, and Unity/Rider open from keyboard shortcuts. The
worktree-folders feature ships as dormant code, locked away this revision.

### Browser markdown → editor handoff
- Opening `.md`/`.mdx`/`.markdown`/`.ipynb` in the embedded browser (address bar,
  the file explorer's "Open in Orca Browser", tab restore, retry — every entry
  point) lands in the editor's rich view instead of Chromium's raw source. Every
  guest URL assignment passes one choke point; a test fails the moment a fifth
  bypass appears.
- Markdown opened from the file explorer never creates a browser tab at all — no
  stray empty "New Tab". A denied authorize or failed stat falls back to the
  browser exactly as before (never a silent no-op).
- A late async probe cannot interfere: navigating elsewhere (address bar, guest
  link, SPA pushState, agent CDP goto) or switching workspaces mid-probe drops it.
  Remote workspaces are judged per file owner and left alone.
- A raw file an agent requests via `browser.goto` is deliberately served raw.
- **Markdown carrying HTML/MDX still lands rendered.** When the rich editor
  cannot represent the syntax, the handoff opens the sanitized markdown preview
  instead of raw source, with the edit tab one click away.
- **A switch restores the old behaviour.** Settings → Experimental → "Browser
  markdown handoff" off makes the browser load markdown raw as before
  (`.ipynb` handoff predates the fork and stays on). Default: on.

### Rich mode for `<details>` documents
- A document whose only "unsupported" HTML is `<details>`/`<summary>` no longer
  falls back to code-only mode. The cause: saving stamped a class onto the opening
  tag, failing the byte-preservation check — the tag is now re-emitted verbatim
  when its semantics were not edited.
- Four families of save corruption fixed alongside: literal tags stripped inside
  fenced code, `</details>` inside inline code mistaken for the real closing tag
  (exact backtick-run matching, multiline spans, block-boundary barriers),
  4-space-indented code blocks, and spans crossing headings/thematic breaks. The
  preservation gate itself is untouched — content genuinely survives, the check
  wasn't loosened.

### Unity: focus the running editor instead of launching another
- "Open in Unity" now detects an editor already running on the project and raises
  its window instead of spawning a second `-projectPath` process. Detection matches
  editor processes only — a `-batchMode` AssetImportWorker on the same path is not
  "open". Path comparison follows path syntax, not host-platform guessing.
- Window raising is per platform (macOS: System Events with unminimize + raise;
  Linux: xdotool; Windows: SetForegroundWindow). Failure shows a cause-specific
  message carrying **the Unity pid** — Accessibility and Automation denials each
  point at the right settings pane, and a missing xdotool or a windowless process
  is never blamed on permissions. A just-launched editor with no window yet says
  "still starting up" and invents no pid.
- Concurrent opens of one project are serialized; a re-click right after launch is
  suppressed by lockfile+grace so a clean quit can relaunch immediately; the seed
  gate is re-checked right before spawn so a live `Library` never races the seeder.

### Unity/Rider shortcuts
- `⌃⌥U` opens Unity, `⌃⌥R` opens Rider (Rider's default binding is macOS-only —
  discovery is macOS-only, so elsewhere the chord would swallow keys for nothing).
  Rebindable in Settings → Shortcuts.
- Targets the active worktree and behaves exactly like the menu item, including the
  cache-copy offer dialog. Ineligible workspaces (SSH, runtime-hosted, folder
  workspaces, non-Unity) get silence. Never fires with terminal focus (AltGr-safe),
  yields to a plugin that claimed the chord, and refuses a worktree mid-deletion.

### Worktree folders — aboard, but locked
- Filing worktrees into named sidebar folders is complete in code (rendering,
  create/rename/nest/delete, worktree→folder conversion, old-host protection) but
  **cannot be enabled this revision** — the experimental settings row is not
  rendered. Tests pin that with the feature absent, sidebar row output is
  byte-identical to before. Planned to surface next revision behind an
  experimental toggle, default off.

### Verification
- The fork contract suite grew from 956 to **1,298 tests** (109 contract files),
  and the manifest guard — asserting every listed file still exists — finally runs
  inside the gate; before this it could not catch the list silently shrinking.
- Eight cross-vendor review rounds reproduced, fixed and pinned ~35 real defects,
  including four data-loss families, six races, wrong permission guidance, and a
  plugin-shortcut shadowing bug.

## machamy.7 — upstream `1.4.178-rc.2` · 2026-08-23

Turns the Unity worktree colour from something assigned for you into something
you pick, and choose where to see.

**Pick a worktree's Unity toolbar colour by hand.** Right-click → Unity Toolbar
Color offers Automatic, twenty palette colours, and a custom picker (which
previews the strip the choice actually paints). **Only a colour another worktree
deliberately picked is blocked** — an automatically assigned one can simply be
taken, and that worktree is reassigned; blocking those too would lock the whole
menu on a repo with as many worktrees as there are colours. Choices persist per
repo, keyed by folder name, and apply immediately via `unity:applyWorktreeTint`
without opening Unity (nothing is created in a non-Unity project); siblings whose
automatic colour moved are rewritten too, changed ones only, local only. Colour
picking lives in one shared module so the menu and the script writer cannot
drift apart. With more worktrees than colours some pair must share one — two
automatic ones, not a deliberate pick; unless all twenty are hand-picked, in
which case no automatic colour is left to give up and one lands on a pick.

**Twenty colours, in two tiers.** The original ten plus ten whose **hues sit at
the midpoints between them**: the toolbar strip keeps only the hue of the pick
at a fixed dark value, so an arbitrary second ten would have looked identical to
the first. **Automatic assignment is unchanged** — it still hashes over the first
tier's length, so existing worktrees keep their colour, and tier two is handed
out only once tier one is fully claimed. The tiers order the automatic
assignment, not the menu: all twenty are listed and pickable, tier two under
"More Colors".

**The same colour on Orca's sidebar row.** Per project: Off / Left colour bar /
Row background tint / Right colour chip — three shapes because they read very
differently at sidebar width. **The default is the left bar**, and because it is
on by default it applies **only to repos confirmed to be Unity projects**; a
plain git repo's rows stay untinted (one filesystem probe per repo per session,
showing nothing until it answers). Hovering an option previews it on the live
rows and saves nothing. All three sit outside layout flow, so a row measures the
same tinted or not, and the default checkout stays uncoloured.

**Surviving upstream merges.** `pnpm test:fork` runs exactly the fork's tests in
one command (listed in `config/fork-contract-tests.mjs`); a merge that deletes or
renames one fails a manifest meta-test loudly instead of silently shrinking the
contract. Fork code that sat on files upstream rewrites moved into fork-owned
modules — the Unity menu, the fork UI IPC listeners, the cold-restore resume
bookkeeping — so the upstream files now touch the fork through a single import
and call each.

**Packaging: `.claude/` excluded from app.asar.** It held whole agent worktree
checkouts (+76MB observed), but the real hazard is that it is written *during* a
build: the mac build packs x64 and arm64 from one file scan, so a file that
changes size in between shifts every later asar offset and the arm64 app dies
with no log output.

**The mode-B follow E2E now keys its verdict on the tab it spawned**, not on the
agent name, so a bystander pane running the same agent can no longer make a good
switch look like a failure.

**Correction.** The long-standing note under machamy.2 that "Tell agents what
changed" only shows a toast was wrong, and is corrected in this rev: it writes
the new path and branch straight into each woken agent's pane, once per pane,
retried at 6/15/30/60/90s. Only the write is guaranteed, not the send — some
TUIs leave the text in the prompt for the user to press Enter.

Full details in the Korean canonical changelog.

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
