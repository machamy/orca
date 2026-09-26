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

## machamy.15 — upstream `1.4.212` · 2026-09-26

Aligns with upstream's latest release, **1.4.212**. machamy.14 merged upstream `main`, but
upstream never bumps the version on `main`; it tags release branches (`v1.4.212`) instead.
So the build was mostly newer than 1.4.212 yet still labeled `1.4.197`. This rev catches
up `main` again and labels the base with the latest release tag.

### Upstream merge (66 commits, label `1.4.197` → `1.4.212`)
- fix 41 · refactor 4 · feat 3. **The one substantive fix that only 1.4.212 had, the Codex
  0.157+ startup failure (#22878, a socket path too long in Orca-managed homes), is in.**
  The rest of the 1.4.212 tag's difference is version bumps, release CI and a
  release-only revert, so there is nothing else to take.
- **The label comes from a `FORK_UPSTREAM_RELEASE` file.** `package.json` keeps upstream's value
  (1.4.197): upstream's hourly tooling and tests assume it stays low, and changing it would
  conflict on every merge. Only the local build (`build:mac`) uses the file as its base
  version; bump it to the latest tag when catching up.
- One upstream test had been failing quietly since machamy.13 (the fork's added
  `extensionSuffixes` field in the source-control filter state). Its expectations are fixed
  and it is now on the fork contract list.
- Upstream features: Cursor usage tracking, a one-time tip for agent session search, and
  native Claude chats recording subagent status.
- Merged upstream's rule that a folder project's root is its default workspace with the
  fork's rule that, after a default-worktree switch, the repo-path checkout is the default
  (folders follow upstream, git repos follow the fork).
- Upstream deleted a Windows process-list helper it no longer used; the Unity editor lookup
  now reads the Windows process table directly.

### Verification
- Fork contract suite **122 files / 1,573 tests** and the merge-affected areas **1,432
  files / 13,112 tests** pass. Typecheck and lint 0 errors.

## machamy.14 — upstream `1.4.197` · 2026-09-25

Catches up **1,307 upstream commits**. No new fork features. The upstream version
stays `1.4.197` (upstream cut no `release:` commit in between). The default-worktree
switch stays: it was not what conflicted — its share of the 11 conflicted files it
touched was a line or two each.

### Markdown preview that looks like GitHub (follow-up to machamy.13's preview)
- **The body uses GitHub's styles.** Light is `#ffffff` with `#1f2328` text; dark is GitHub's
  dark default, `#0d1117` with `#f0f6fc`. 16px body at 1.5 line height, rules under h1/h2,
  inline code chips, `#f6f8fa` code blocks, bordered and striped tables, a left bar on
  quotes and a heavy hr, all at GitHub's values. Only the preview body changes; review
  notes, search and the toolbar keep Orca's look.
- **Inline code vanished on a light app.** The preview read the theme once when it opened,
  so opening it while macOS was dark and Orca light froze it dark: the code chip became 10%
  white on white, and only its padding showed as gaps. It now uses upstream's reactive
  theme hook (`useDocumentDarkTheme`).
- **Text wrapped at 60% of the width.** Upstream's new review notes reserve a 220–300px
  note column beside **every** block, even with no notes, so multi-line paragraphs wrapped
  narrow while one-liners ran full width. The column now exists only on blocks with a note
  or an open composer. The hover `+` button is unchanged.
- Inline `<code>` no longer leaks a `node="[object Object]"` attribute.
- **GitHub alerts.** `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]`
  showed as a quote with the literal marker. They now render as GitHub's alerts: colored
  bar, icon and title (GitHub's colors; titles stay English, as on GitHub).
- **Line breaks like a GitHub file view.** The preview turned every source newline into
  `<br>`, which is how comments render. GitHub joins those lines when showing a `.md`
  file, and now so does the preview; explicit breaks (two trailing spaces or `\`) stay.
  Sidebar comment rendering keeps its breaks, since those are comments.
- Code-block comments are no longer italic, matching GitHub.
- **Task lists and footnotes like GitHub.** Checkboxes came out as Orca's custom box or the
  native one depending on the item; they are now GitHub's native disabled checkbox (dark
  styled in dark). Footnotes render small and muted under a rule, with a text `↩` rather
  than an emoji. The last paragraph of an alert no longer adds bottom space.
- **Footnote and anchor links did not jump.** The sanitizer prefixes ids with
  `user-content-`, but the preview matched ids exactly, so footnote links
  (`#user-content-fn-1`, whose real id carries the prefix twice) and `#links` to raw-HTML
  ids went nowhere. Like GitHub, it now also tries the prefixed id.

### Upstream merge (1,307 commits, `1.4.197` unchanged)
- By type: fix 602 · **perf 224** · feat 166 · test 87 · refactor 64.
- By area: **mobile 208** · native chat 97 · relay 63 · terminal 54 · runtime 37 ·
  orchestration 22 · browser 21 · editor 20 · agent status 19 · sidebar 13.
- Notable upstream features: **bundled ripgrep** (local, WSL, SSH search), **Jupyter
  notebooks rendered as notebooks and run in a persistent kernel**, **agent-session
  history search** (`orca search`, across computers), **default terminal shell** and
  shell-argument settings, terminal **inline images**, **collapsed unchanged regions**
  in diffs, **multi-line range** diff comments, **base-ref picker** in the New Workspace
  composer, per-project **gh account binding**, a setting to turn off preview tabs, and
  ZCode, Muse Code and OpenCode 2 harnesses.
- **Upstream removed Agent Map entirely** (#20929). The fork's workspace-menu tests on
  that surface lost their subject and left the contract list; the same actions stay in
  the sidebar menu.

### What the fork adjusted
Resolved 25 conflicts. Upstream again dissolved files into facades
(`src/shared/rpc-contract/*`); fork edits were transplanted into the new modules:

- **RPC schemas.** `StrictOptionalBoolean`, the `worktree.defaultSet` selector and the
  worktree-folder fields moved into upstream's new `rpc-contract` modules; the params
  catalog was regenerated.
- **CLI.** Upstream's `terminal create --shell` moved into the fork's split-out
  `specs/terminal.ts`.
- **Worktree ID migration.** Upstream's new row re-pointing (closed-terminal tombstones,
  client-hosted browser pages) merged into the fork's session-migration module.
- **Agent status cache.** Upstream made the cache read-only, so the direct write during
  worktree migration now goes through upstream's `admitLegacyAgentStatus`. Both the
  fork's `effort` field and upstream's `modelSwitchCommand` survive.
- **Line caps.** Five files upstream grew went over `max-lines` because of the fork's
  share. No disable comments — the fork's share moved into its own files: fork settings
  types (`fork-global-settings.ts`), title-based agent identity
  (`worktree-title-agent-identity.ts`), the default-switch menu item, Unity seed
  scheduling, and the browser URL sync's `worktreeId` lookup. `global-settings-types.ts`
  and `browser-page-pane.tsx` are now one line off, or identical to, upstream, which
  makes the next merge lighter.
- **Two fork bugs caught by new upstream tests.**
  - The Unity seed re-listed worktrees right after a create. That scan could start before
    the create path recorded the new worktree's metadata and cache a stale name. It now
    lists only for Unity projects whose seeding was not declined.
  - The temporary diagnostic added to chase vanishing tabs **walked every terminal tab on
    every store update**, so each update got slower with workspace count. It now compares
    only when the tab map actually changed.
- **Two new upstream tests aligned with fork behavior.** Upstream saves an edited
  `<details>` with `class="orca-details"` added; the fork keeps the source opening tag
  (machamy.8's save-time corruption fix). The two summary-image/math edit tests now
  expect that.

### Verification
- Fork contract suite **120 files / 1,517 tests** pass. Typecheck 0 errors, lint on
  changed files 0 errors, no `max-lines` disables added.

## machamy.13 — on upstream `1.4.197` · 2026-09-25

Makes reviewing code and reading docs easier. No upstream merge.

### Markdown preview is back in the toggle, and is the default view
- The rich editor refuses raw HTML, prose generics (`List<Foo>`) and anything over
  50k characters; such docs dead-ended at "editable only in code mode". The renderer
  was never missing — upstream moved preview to a **separate tab** in #849 and dropped
  it from the toggle, but left the in-pane preview path in both the edit and diff
  surfaces.
- That path is exposed again: the editor's top-right toggle is **Source · Rich ·
  Preview · Changes**. Preview renders like GitHub (GFM tables and task lists, raw
  HTML, `<details>`, highlighted code, cross-document links).
- **Markdown opens in Preview by default.** Settings → Editor → "Markdown Default
  View" picks Preview, Rich or Source; the per-file toggle still wins.
- **Diffs can switch to Preview too** (rendering the modified side). Their default
  stays Source — a diff tab is opened to see changes, which a preview would hide.
- Note: an unfenced `List<MetaRewardDto>` loses `<MetaRewardDto>` as an unknown tag,
  exactly as on GitHub. Backticks keep it.

### Source Control filter: by extension, with a review preset
- The filter was a path substring, so `.cs` dragged in `Foo.cs.meta`, `Foo.csproj`
  and `style.css`, and several extensions could not be asked for at once. Tokens
  written as extensions (`.cs .json .md`, `*.cs`, `.cs.meta`) now match the path's
  **ending** and OR together; a bare word keeps its substring meaning, so folder
  searches are unchanged. Working-tree groups and the committed-vs-base list share it.
- A **`.cs .json .md` chip** beside the input leaves just the files a human reads when
  reviewing agent output; a second click clears it.

### Verification
- Fork gate **120 files / 1,468 tests** green; typecheck and lint 0.
- Two rendered-app checks: a seven-extension fixture through the filter, and a doc the
  rich editor refuses (raw HTML, prose generics, >50k chars) opening in the GitHub-style
  preview by default and toggling Source ↔ Preview. Also rendered a real 135KB internal
  doc and checked it by eye.

## machamy.12 — on upstream `1.4.197` · 2026-09-09

Fixes machamy.11's badge appearing on some agent panes and not others. Digging
into it found a defect **a layer below the badge**.

### Orca was discarding Claude's model and effort
- Claude puts the model in use and the effort applied to the current turn on
  **every tool-use hook** (PreToolUse, PostToolUse, Stop, …) — as
  `model: { id, display_name }` and `effort: { level }` (effort is also exposed as
  the `CLAUDE_EFFORT` environment variable).
- The shared normalizer keeps **string fields only**:
  `if (typeof value !== 'string') return undefined`. Both of Claude's values are
  objects, so both were dropped — and `buildClaudeStatusPayload` never passed them
  in the first place. **A Claude pane's status row has never carried a model.**
- machamy.11's badge therefore leaned on its only remaining source, the startup
  frame scraped off the screen. That frame is printed once and never redrawn: it
  scrolls away (badge goes blank) and a mid-session `/model` leaves it **wrong**.

Both values are now read off the hook and carried on the status row
(`claude-model-effort-fields.ts`). The model uses `display_name` rather than the
dated id — the name the user picked in `/model`.

### Badge precedence corrected
- **The reported status row now wins for both model and effort.** It refreshes on
  every tool-use hook, so a mid-session `/model` or `/effort` is picked up on the
  next tool call.
- The startup frame is **demoted to a fallback**, and its effort is used only when
  the model the frame names is the model being displayed — an effort left over from
  a model the session has since left would state a pairing the agent is not running.
- Side benefit: with the model finally landing on the status row, every other
  surface that reads that row learns the Claude session's model too.

### Unity auto-seed had been dead since machamy.9
- The call that CoW-clones the default checkout's `Library` into a fresh worktree
  used to live at `orca-runtime.ts:24937`. The machamy.9 merge took upstream's
  split of that file (40,904 → 58 lines) and **the call went with it.** The seeder
  and its tests survived, so the gate stayed green — a function nobody invoked,
  with passing tests. New Unity worktrees have only been seedable from the
  context menu since.
- Re-transplanted at its original position (`orca-runtime-create-managed-worktree.ts`,
  right after the local worktree is materialized). The logic lives in
  `runtime-local-worktree-unity-seed.ts` so the upstream file carries a single
  fork line, and **a source census now pins that line** — the next merge that
  swallows it turns the gate red.

### The webview server's `node_modules` — solved with no fork code
- Every worktree was missing `web/node_modules` (~419MB) and needed a fresh
  `npm install`. Upstream already has the answer: a repo-root **`.worktreeinclude`**
  listing gitignored paths to copy into each new worktree — by **APFS CoW clone**
  on macOS, seconds and shared blocks (`materializeWorktreePaths(..., 'copy')` →
  `cloneWorktreePathWithApfs`). Absent paths are skipped silently, so a project
  without a webview server is untouched.
- Nothing was added to the fork. One line on the project side:
  ```
  web/node_modules
  ```

### Verification
- 3 new unit files (12 field-reader, 3 ingestion, 5 seed-call-site cases) registered
  in the fork gate: **117 files / 1,445 tests** green. Runtime suite: 1,259 green. Typecheck 0, lint 0.
- The ingestion test feeds real hook payloads and asserts a **mid-session model
  switch is tracked**, not pinned.
- Both Playwright checks re-run in the rendered app: the badge reads `Opus · High`
  from the status row, its right-click menu moves it, and a vertical split gives
  each pane a badge within its own bounds.
- machamy.11 shipped a test asserting the wrong precedence was correct. Flipped.

## machamy.11 — on upstream `1.4.197` · 2026-09-07

No upstream merge. One fork feature: **every agent pane names the model and
reasoning effort it is running, in one of its corners.**

### Model and effort badge
- A pill like `Opus · High` sits in a corner of **each agent pane** — Claude and
  Codex alike. Per pane rather than per tab, so a split showing Claude beside
  Codex names both instead of only the focused one.
- **Left- or right-clicking the pill opens its own menu**: move it between the
  top-left, top-right and bottom-right corners, or hide it. Hiding leaves nothing
  to click, so **Settings → Experimental owns turning it back on** (and picking
  the corner).
- Bottom-right by default. A pane's top edge already carries the title and the
  split/close cluster, so a top corner sits on chrome the user reaches for.

### What entitles it to claim a value
Three sources, strongest first, because they carry different proof:
1. **Claude's own TUI header frame** — the only source carrying effort (it reuses
   the parser upstream already had).
2. **The agent's reported status row** (`AgentStatusEntry.model`) — model only.
3. **The persisted launch pick** — what Orca started the agent with, never
   evidence about what is running now.

When anything on screen came from the third source the pill is drawn **dimmed and
italic**, and its tooltip says the agent has not reported back. **Codex changes
its model inside its own picker, which Orca cannot read**, so a Codex TUI pane
usually lands there. Showing an unverified value as fact is a lie the user cannot
check, so a confirmed model beside a guessed effort still downgrades the pill.

### Verification
- 20 new unit tests across 3 files, registered in the fork contract gate:
  **116 files / 1,426 tests** green. Typecheck (node, web, cli) 0 errors, lint 0.
- Two Playwright checks in the rendered app: the badge lands inside the pane it
  describes, right-click opens the menu, and choosing "Top left" really moves it.
  The second **measures a vertical split** — each pane gets its own badge, within
  its own bounds. `.pane` has no `position: relative` CSS rule, so a split looked
  like it might let the badge escape to the tab's corner; measuring showed it does
  not, and the test now pins that.

## machamy.10 — on upstream `1.4.197` · 2026-09-07

Catches the fork up to upstream by **561 commits**. No new fork features. Unlike
machamy.9, the merge swallowed **nothing** — upstream's large module-splitting
wave had already passed in machamy.9. This upstream batch is mostly **fixes (237)
and performance (136)** rather than new capability.

### Upstream merge (561 commits, `1.4.178-rc.2` → `1.4.197`)
- Commits by area: **SSH 43** · native chat 32 · **relay 23** · terminal 19 ·
  renderer 18 · cloud 14 · Windows 13 · **mobile 10** · worktrees 9 · sidebar 9 ·
  orchestration 9 · i18n 9.
- 136 of them are performance work (renderer 16 · terminal 10 · persistence 7 ·
  worktrees 9 · sidebar 5 · startup 4 · editor 4). Upstream also brought a lint
  rule for repeated sort setup and performance-regression contracts.
- Notable upstream features: structured native Claude chat moved onto the
  **Claude Agent SDK and is enabled on macOS and Linux**, **real background push
  notifications** on mobile, durable multi-agent workflows (#16904), a **Show
  Whitespace** toggle in the diff viewer, and **Korean, French and Japanese**
  locale coverage (Orca Account settings, onboarding).
- 33 further mobile and relay fixes came with it — the phone learning its desktop
  signed out, relay cell crash-rate alerts, dynamic NAT port allocation.

### What the fork had to change
Twelve conflicts were resolved and the fork contract gate reported **zero
failures**, meaning no fork behavior was lost. What remains is follow-up to
upstream's moves:

- **Unity process lookup rewired.** Upstream moved the process-table reader, so
  `unity-editor-process-lookup.ts` now reads
  `shared/process-table-snapshot-reader`. The Windows reader hands back a readonly
  view, so only that path copies before returning.
- **`visible-worktrees.ts` split.** Upstream added to the file and pushed it past
  `max-lines`. Split at a real seam instead of a disable comment — published cache
  (`visible-worktree-publication.ts`) and runtime lookups
  (`visible-worktree-runtime-lookups.ts`). Re-exports keep every import site as is.
- **Fork files registered with upstream's new census and fixture.** machamy.9's
  test stub is now declared in the browser tab-close census, and upstream's new
  Chromium error-page fixture carries the `worktreeId` the fork requires.

### One test upstream broke with its own fixture
- `orchestration-cli-subprocess` came up red. It looked like a merge regression at
  first, but a clean upstream `main` fails identically — #16904's new
  `stable_pane_required` guard disagrees with upstream's own fixture. Upstream CI
  never sees it because it does not build `out/cli`, so the file is skipped. Fixed
  by giving the fixture a live pane and a Run binding; **no production code was
  touched** and the assertions are unchanged.

### Verification
- Fork contract suite: **113 files / 1,406 tests** green. Sidebar-related suites:
  321 files / 2,735 tests green. Typecheck (node, web, cli) 0 errors, lint 0
  errors, no new `max-lines` disables.
- Classifying the full suite produced **zero fork-caused regressions**.
- Two diagnostic notes. A merge that changes `package.json` and the lockfile makes
  every pre-reinstall result untrustworthy — it ran against the old libraries. And
  running `patched-dependencies-frozen-install` directly falls back to npm, which
  strips the patches out of `node_modules`; `pnpm install --frozen-lockfile`
  restores them.
- `cross-version-agent-session-wire` was red only because it reads `HEAD` while the
  merge was still uncommitted. After the commit all 13 tests pass — an ordering
  problem, not a code one.

## machamy.9 — on upstream `1.4.178-rc.2` · 2026-09-03

Catches the fork up to upstream by **912 commits**. No new fork features; two
problems machamy.8 surfaced — the Unity shortcuts and the window-focus lookup —
are fixed.

### Unity shortcuts moved
- **`⌘⌥U` opens Unity, `⌘⌥⇧R` opens Rider.** machamy.8's `⌃⌥U`/`⌃⌥R` are
  withdrawn for two reasons: `⌃⌥U` is Rectangle's top-left-quarter tiling
  default, so the chord **resized windows** instead of opening Unity; and the
  alternative `⌥U` is a macOS dead key, so a **terminal received the umlaut**
  (`neverInTerminal` suppresses the action, not the text input). `⌘` suppresses
  text input and Rectangle lives on `⌃⌥`, so this pair avoids both. Rider takes
  the `⇧` variant because `⌘⌥R` is already workspace rename. Rebindable in
  Settings → Shortcuts.

### Unity refocus: Hub mistaken for the editor
- When a project is launched from Hub, **the Hub process carries the same
  `-projectPath`**, so the "already open" lookup could return Hub's pid —
  raising Hub's window, or naming the wrong pid in the failure popup. The cause
  was the **space** in `/Applications/Unity Hub.app/…`: splitting argv[0] at the
  first space yielded `/Applications/Unity`, basename `Unity`, which passed the
  editor check. argv[0] is now parsed with the same rules as a `-projectPath`
  value, and only an executable named exactly `Unity` (`Unity.exe`) counts. The
  seeding gate is unchanged — a Hub holding the project is still a reason not to
  clone the cache.

### Upstream merge (912 commits)
- By area: terminal 49 · renderer 43 · **mobile 31** · native-chat 22 ·
  worktree 20 · git 19 · browser 18 · Windows 17 · WSL 14 · runtime 14 · SSH 13 ·
  Codex 13 · **relay 12**.
- 26 mobile/relay fixes arrived: session-parity restore after extraction,
  host-follow tab snapshots, dismissing the keyboard after sending to an agent,
  the create-worktree sheet dying after picking a PR, reaping owned PTYs when the
  daemon dies, PTY ids carrying the relay incarnation instead of a restarting
  counter. Whether these reduce the error screens seen on the phone is a thing to
  **check**, not a claim.
- Upstream did not edit its big files — it **split them into modules and left
  thin facades** (`orca-runtime.ts` 40,904→58 lines, `ipc/pty.ts` 8,134→39,
  `useIpcEvents.ts` 4,539→7). Fork code living in those files had no home left
  and was re-ported into upstream's new modules.

### What the merge swallowed (the fork gate caught all of it)
After the 55 conflicts were resolved, the contract suite failed in 18 places —
none of which a typecheck would have caught.

- `retainSurface` on both the sleep and hibernation kills (the point is that it
  is a flag *separate* from `keepHistory`; upstream's modules kept only the latter)
- the whole `clearDeadLeafPtyBindings` action
- the entire cold-restore resume-claim path — which also exposed two sibling
  tests that had been passing vacuously with nothing left to skip
- follow-mode wake plumbing (two store actions plus a 200-line caller) and the
  default-switch runtime plumbing
- the default-worktree switch's context-menu entry point, and the Unity menu
  with its confirm dialog
- fork IPC listener registration, and `migrations`/`shieldOnly` on
  `worktrees:changed`
- two preload listeners, and six fork fields on `RepoUpdate`
- two path-based policy helpers (the fork keys on the repo-path checkout because
  git's main-worktree flag follows the displaced side after an in-place switch)

### What upstream caught in the fork
- Three Unity files added in machamy.8 imported `node:child_process` directly.
  Upstream brought a ratchet test that watches for exactly this, and it was
  right: they now go through the shared `runProcess`/`spawnProcess`, which pins
  `windowsHide`, refuses `shell: true`, and encodes `.cmd`/`.bat` arguments.

### Verification
- Fork contract suite **113 files / 1,403 tests** green. Typecheck (node, web,
  cli) clean, lint clean, no new `max-lines` suppression (six files were split
  at real seams instead).
- The browser markdown handoff E2E re-run against the real rendered app.
- The merge changed `package.json` by 127 lines and the lockfile by 2,302, so
  until dependencies were reinstalled the suite was running against the old
  xterm. Reinstalling cleared 23 IME failures — an install-state problem, not a
  code regression.

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
- `⌘⌥U` opens Unity, `⌘⌥⇧R` opens Rider (Rider's default binding is macOS-only —
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
