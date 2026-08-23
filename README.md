<h1 align="center">
  <a href="https://onOrca.dev"><img src="resources/build/icon.png" alt="Orca" width="64" valign="middle" /></a> Orca
</h1>

<p align="center">
  <a href="https://github.com/stablyai/orca"><img src="https://img.shields.io/github/stars/stablyai/orca?style=flat&amp;label=%E2%98%85&amp;color=08C" alt="GitHub stars" /></a>
  <a href="https://github.com/stablyai/orca/releases"><img src="docs/assets/readme-downloads.svg" alt="Total downloads across all releases" /></a>
  <img src="https://img.shields.io/badge/license-MIT-08C?style=flat" alt="License: MIT" />
  <a href="https://discord.gg/fzjDKHxv8Q"><img src="https://img.shields.io/badge/Discord-5865F2?logo=discord&logoColor=white" alt="Join the Orca Discord" /></a>
  <a href="https://x.com/orca_build"><img src="https://img.shields.io/badge/X-000000?logo=x&logoColor=white" alt="Follow Orca on X" /></a>
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-4493F8?style=flat-square" alt="Supported platforms: macOS, Windows, and Linux" />
</p>

<p align="center">
  <sub><a href="docs/readme/README.zh-CN.md">中文</a> · <a href="docs/readme/README.ja.md">日本語</a> · <a href="docs/readme/README.ko.md">한국어</a> · <a href="docs/readme/README.es.md">Español</a> · <a href="docs/readme/README.fr.md">Français</a> · <a href="docs/readme/README.pt.md">Português</a></sub>
</p>

<p align="center">
  <strong>The AI Orchestrator for 100x builders.</strong><br/>
  Run Codex, ClaudeCode, OpenCode or Pi side-by-side — each in its own worktree, tracked in one place.
</p>

<h3 align="center"><a href="https://onorca.dev/download"><ins>Download Orca</ins></a></h3>

<p align="center">
  <img src="docs/assets/readme-hero.jpg" alt="Orca desktop app running agents in parallel worktrees, with the Orca mobile companion app in the corner" width="960" />
</p>

> [!NOTE]
> ### This is a fork — [machamy/orca](https://github.com/machamy/orca)
>
> A personal fork of [stablyai/orca](https://github.com/stablyai/orca).
> **Everything upstream still works**; only [What this fork
> adds](#what-this-fork-adds), immediately below, is not in upstream.
>
> - **Changelog**: [`FORK_CHANGELOG.md`](FORK_CHANGELOG.md) (Korean, canonical) ·
>   [`FORK_CHANGELOG.en.md`](FORK_CHANGELOG.en.md) (English translation). Per-step
>   detail and commit hashes live there, not in this README.
> - **Version scheme**: `<upstream version>.machamy.<N>.local.<timestamp>.<commit12>` —
>   e.g. `1.4.178-rc.2.machamy.7.local.…`. `N` is the value in the root
>   [`FORK_VERSION`](FORK_VERSION) file and goes up on each fork milestone.
> - **Not distributable — build it yourself.** Local builds are self-signed
>   (`Orca Local Signing`), with no Apple Developer ID and no notarization, so a
>   build handed to someone else is refused by their Gatekeeper (`spctl`
>   rejected). → [Install](#install)
> - This fork's docs are written in **Korean first**; the English is a translation.

## What this fork adds

It addresses the two confusions that show up when one Unity project is run across
several worktrees at once — **"which worktree is this editor?"** and **"which
branch is sitting in the repo folder?"**

<table>
<tr>
<td width="50%" valign="middle">

### A different Unity colour per worktree

For anyone who has had two editors open and lost track of which is which. A
generated editor script tints **the toolbar holding the play controls** in that
worktree's colour and **prefixes the worktree name to the window title**. Colours
are handed out from 20 (10 primary + 10 fallback) so siblings never collide, and
you can also pick one by hand — right-click a worktree → **Unity Toolbar Color**
for ten presets or a colour picker (a colour another worktree already picked is
locked out). The **default worktree stays uncoloured**, so "has a colour" reads
as "is a side worktree".

The script is only ever written to a gitignored path: **it asks git whether the
path is ignored before writing, and skips the repo entirely if it isn't** — it
never creates a file that would be tracked.

</td>
<td width="50%">
  <img src="docs/assets/fork-unity-toolbar-tint.png" alt="Two Unity editors whose toolbars are tinted in different per-worktree colours" width="100%" />
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### That colour on the sidebar row

The worktree's Unity colour is echoed on its Orca sidebar row. Choose per project
between **off / left colour bar / row background tint / right colour chip**;
hovering an option in the repo ⋯ menu previews it on the live rows. The bar is the
default, and it only turns on for repos confirmed to be Unity projects.

</td>
<td width="50%">
  <img src="docs/assets/fork-sidebar-tint-modes.png" alt="The four ways a worktree's Unity colour can appear on a sidebar row" width="100%" />
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Unity worktree actions

One right-click on a worktree gets you **Copy Unity Cache** (an APFS copy of the
default checkout's Library — seconds, near-zero extra disk) · **Open in Unity**
(at exactly the editor version named in `ProjectVersion.txt`) · **Open in Rider**
(on the Unity-generated `.sln`, copied over from the default checkout when the
worktree has none yet).

The cache copy **never copies a live editor's Library** — a lockfile, the process
table, and a recent-launch TTL all gate it, and it re-checks once more after the
copy. It lands in a staging folder and is finished by an atomic rename, so a crash
mid-copy can never leave half a Library behind.

</td>
<td width="50%">
  <img src="docs/assets/fork-unity-worktree-menu.png" alt="The worktree right-click menu with Copy Unity Cache, Open in Unity, Open in Rider, and Unity Toolbar Color" width="100%" />
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Make Default Worktree

Promote a sub-worktree to the repo's default checkout. Nothing moves on disk:
it **swaps the two worktrees' branches in place** — git's main worktree (the
`.git` holder) and the repo folder path stay exactly where they were, so GitHub
Desktop or an IDE pointed at the repo folder sees the promoted branch right away.
Uncommitted, staged and untracked changes follow their branch (the switch dialog
can leave untracked files in place instead); ignored files stay put.

Drag a worktree onto the **Default** card, or run
`orca worktree default set --worktree <selector>`. The optional **agents follow
the branch** toggle sleeps both worktrees and resumes each agent where its branch
now lives (Claude/Codex).

</td>
<td width="50%">
  <img src="docs/assets/fork-make-default-worktree.png" alt="Dragging a worktree onto the Default card to promote it to the repo's default checkout" width="100%" />
</td>
</tr>
</table>

**Also added by this fork:**

- **`pnpm test:fork`** — a one-command regression gate over the tests that pin the
  fork's behavior, for quickly checking the fork survived an upstream merge. The
  list lives in
  [`config/fork-contract-tests.mjs`](config/fork-contract-tests.mjs), and a merge
  that deletes one of its files fails a meta test immediately.
- **Markdown GitHub-style view** — .md files with raw HTML that the preview blocks
  can be rendered GitHub-flavored via a button on the notice banner.
- **First-open Unity crash avoided** — the Firebase plugin regenerates
  `google-services-desktop.json` on every editor load, and that colliding with the
  first import storm after a seed killed Unity (the "have to open it twice"
  symptom). The mtime is aligned so the regeneration is skipped — but only when the
  generated file is byte-identical to its source.
- **Sidebar default-row fixes** — the primary star, sort anchor, hide filters and
  delete guards key on the **repo path** rather than git's `isMainWorktree`, so the
  correct row still reads as "default" after a switch.
- **Branch-swap data-safety hardening** — partial-capture restore, post-checkout
  hook resilience, and up-front rejection of worktrees mid-merge/cherry-pick/revert.

> [!IMPORTANT]
> **What's verified, and the known limits** — written down rather than hidden.
>
> - The branch swap, "agents stay" mode and the data-safety cases are verified
>   against real git repos with regression tests. **"Agents follow"** passed all 14
>   contract items for 36 consecutive rounds on a real 12-pane fixture, but on
>   **macOS arm64 only** — Linux, Windows and SSH are unverified.
> - The Unity work was checked on a real editor (6000.3.16f1). **The Library copy
>   and "Open in Rider" are macOS-only** (the copy depends on APFS copy-on-write).
>   "Open in Unity" and the toolbar tint are written to work on other platforms,
>   but are **verified on macOS only**.
> - **The "notify agents" toggle really does write into the panes, but it cannot
>   guarantee the note is sent.** At 6/15/30/60/90s after the switch it types the
>   new path and branch into each woken agent pane, once per pane (panes mid-turn
>   are left alone). The note ends with an Enter, but some agent TUIs do not take
>   it and leave the text sitting in the prompt — then you press Enter yourself.
> - A plain shell loses its scrollback across a switch (the process cannot move).
>   Tabs, placement and splits are preserved.
> - The toolbar tint paints the main toolbar on Unity 6000.3 and newer, and falls
>   back to a Scene view bar on older editors. If either fails, the toolbar is
>   silently left at its default colour.

---

## Features

Everything below is **upstream Orca** — all of it works in this fork too.

<table>
<tr>
<td width="50%" valign="middle">

### Mobile Companion

Monitor and steer your agents from your phone — get notified when an agent finishes and send follow-ups from anywhere.

[iOS App Store](https://apps.apple.com/us/app/orca-ide/id6766130217) · [TestFlight](https://testflight.apple.com/join/YjeGMQBA) · [Android APK 0.0.43](https://github.com/stablyai/orca/releases/download/mobile-android-v0.0.43/app-release.apk) · [Docs →](https://www.onorca.dev/docs/mobile)

</td>
<td width="50%">
  <a href="https://www.onorca.dev/docs/mobile"><picture><source srcset="docs/assets/feature-wall/mobile-companion-app-showcase.gif" type="image/gif"><img src="docs/assets/feature-wall/mobile-companion-app-showcase.jpg" alt="Orca desktop with the mobile companion app" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Parallel Worktrees

Fan one prompt across five agents, each in its own isolated git worktree — compare the results and merge the winner.

[Docs →](https://www.onorca.dev/docs/model/worktrees)

</td>
<td width="50%">
  <a href="https://www.onorca.dev/docs/model/worktrees"><picture><source srcset="docs/assets/feature-wall/parallel-worktrees.gif" type="image/gif"><img src="docs/assets/feature-wall/parallel-worktrees.jpg" alt="Parallel worktree orchestration" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Terminal Splits

Ghostty-class terminals with WebGL rendering, infinite splits, and scrollback that survives restarts.

[Docs →](https://www.onorca.dev/docs/terminal)

</td>
<td width="50%">
  <a href="https://www.onorca.dev/docs/terminal"><picture><source srcset="docs/assets/feature-wall/terminal-splits.gif" type="image/gif"><img src="docs/assets/feature-wall/terminal-splits.jpg" alt="Terminal splits" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Design Mode

Click any UI element in a real Chromium window to send its HTML, CSS, and a cropped screenshot straight into your agent's prompt.

[Docs →](https://www.onorca.dev/docs/browser/design-mode)

</td>
<td width="50%">
  <a href="https://www.onorca.dev/docs/browser/design-mode"><picture><source srcset="docs/assets/feature-wall/design-mode.gif" type="image/gif"><img src="docs/assets/feature-wall/design-mode.jpg" alt="Embedded browser and Design Mode" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### GitHub &amp; Linear, Native

Browse PRs, issues, and project boards in-app — open a worktree from any task and review without a context switch.

[Docs →](https://www.onorca.dev/docs/review/linear)

</td>
<td width="50%">
  <a href="https://www.onorca.dev/docs/review/linear"><picture><source srcset="docs/assets/feature-wall/github-linear.gif" type="image/gif"><img src="docs/assets/feature-wall/github-linear.jpg" alt="GitHub and Linear task workflows in Orca" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### SSH Worktrees

Run agents on a beefy remote box with full file editing, git, and terminals — auto-reconnect and port forwarding included.

[Docs →](https://www.onorca.dev/docs/ssh)

</td>
<td width="50%">
  <a href="https://www.onorca.dev/docs/ssh"><picture><source srcset="docs/assets/feature-wall/ssh-worktrees.gif" type="image/gif"><img src="docs/assets/feature-wall/ssh-worktrees.jpg" alt="Remote worktrees over SSH" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Annotate AI Diffs

Drop comments on any diff line and ship them back to the agent — review, edit, and commit without leaving Orca.

[Docs →](https://www.onorca.dev/docs/review/annotate-ai-diff)

</td>
<td width="50%">
  <a href="https://www.onorca.dev/docs/review/annotate-ai-diff"><picture><source srcset="docs/assets/feature-wall/annotate-diff.gif" type="image/gif"><img src="docs/assets/feature-wall/annotate-diff.jpg" alt="Annotate AI-generated diffs" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Drag Files to Agents

VS Code's editor with autosave everywhere — drag files or images straight into an agent prompt.

[Docs →](https://www.onorca.dev/docs/editing/file-explorer)

</td>
<td width="50%">
  <a href="https://www.onorca.dev/docs/editing/file-explorer"><picture><source srcset="docs/assets/feature-wall/file-drag.gif" type="image/gif"><img src="docs/assets/feature-wall/file-drag.jpg" alt="Drag files and images into an agent prompt" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Orca CLI

Agents drive Orca too — script every workflow with `orca worktree create`, `snapshot`, `click`, and `fill`.

[Docs →](https://www.onorca.dev/docs/cli/overview)

</td>
<td width="50%">
  <a href="https://www.onorca.dev/docs/cli/overview"><picture><source srcset="docs/assets/feature-wall/orca-cli.gif" type="image/gif"><img src="docs/assets/feature-wall/orca-cli.jpg" alt="Script Orca from the CLI" width="100%" /></picture></a>
</td>
</tr>
</table>

**Also in the box:**

- **[Quick open](https://www.onorca.dev/docs/model/quick-open)** — Search across worktrees, files, agents, commands, and repo context without leaving your flow.
- **[Account switcher &amp; usage tracking](https://www.onorca.dev/docs/agents/usage-tracking)** — See Claude and Codex usage and rate-limit resets, and hot-swap accounts without re-logging in.
- **[Rich repo previews](https://www.onorca.dev/docs/editing/markdown)** — Preview Markdown, images, PDFs, and repo docs in the workspace.
- **[Computer Use](https://www.onorca.dev/docs/cli/computer-use)** — Let agents operate desktop apps and visible UI when a workflow needs real interaction.
- **[Notifications and unread state](https://www.onorca.dev/docs/notifications)** — Know when an agent finishes or needs attention, then mark threads unread to come back later.
- **And many, many more** — we ship daily, so this list is perpetually behind. The [changelog](https://github.com/stablyai/orca/releases) is the real feature list.

---

## Supported Agents

Works with **any CLI agent** — if it runs in a terminal, it runs in Orca.

<p>
  <a href="https://docs.anthropic.com/claude/docs/claude-code"><kbd><img src="docs/assets/claude-logo.svg" alt="Claude Code logo" width="16" valign="middle" /> Claude Code</kbd></a> &nbsp;
  <a href="https://github.com/openai/codex"><kbd><img src="https://www.google.com/s2/favicons?domain=openai.com&sz=64" alt="Codex logo" width="16" valign="middle" /> Codex</kbd></a> &nbsp;
  <a href="https://x.ai/cli"><kbd><img src="https://www.google.com/s2/favicons?domain=x.ai&sz=64" alt="Grok logo" width="16" valign="middle" /> Grok</kbd></a> &nbsp;
  <a href="https://cursor.com/cli"><kbd><img src="https://www.google.com/s2/favicons?domain=cursor.com&sz=64" alt="Cursor logo" width="16" valign="middle" /> Cursor</kbd></a> &nbsp;
  <a href="https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli"><kbd><img src="https://www.google.com/s2/favicons?domain=github.com&sz=64" alt="GitHub Copilot logo" width="16" valign="middle" /> GitHub Copilot</kbd></a> &nbsp;
  <a href="https://opencode.ai/docs/cli/"><kbd><img src="https://www.google.com/s2/favicons?domain=opencode.ai&sz=64" alt="OpenCode logo" width="16" valign="middle" /> OpenCode</kbd></a> &nbsp;
  <a href="https://mimo.xiaomi.com/coder"><kbd><img src="https://www.google.com/s2/favicons?domain=mimo.xiaomi.com&sz=64" alt="MiMo Code logo" width="16" valign="middle" /> MiMo Code</kbd></a> &nbsp;
  <a href="https://ampcode.com/manual#install"><kbd><img src="https://www.google.com/s2/favicons?domain=ampcode.com&sz=64" alt="Amp logo" width="16" valign="middle" /> Amp</kbd></a> &nbsp;
  <a href="https://openclaude.gitlawb.com/"><kbd><img src="resources/openclaude-logo.png" alt="OpenClaude logo" width="16" valign="middle" /> OpenClaude</kbd></a> &nbsp;
  <a href="https://antigravity.google/docs/cli-overview"><kbd><img src="https://www.google.com/s2/favicons?domain=antigravity.google&sz=64" alt="Antigravity logo" width="16" valign="middle" /> Antigravity</kbd></a> &nbsp;
  <a href="https://pi.dev"><kbd><img src="https://pi.dev/favicon.svg" alt="Pi logo" width="16" valign="middle" /> Pi</kbd></a> &nbsp;
  <a href="https://omp.sh"><kbd><img src="https://omp.sh/favicon.svg" alt="oh-my-pi logo" width="16" valign="middle" /> oh-my-pi</kbd></a> &nbsp;
  <a href="https://hermes-agent.nousresearch.com/docs/"><kbd><img src="https://www.google.com/s2/favicons?domain=nousresearch.com&sz=64" alt="Hermes Agent logo" width="16" valign="middle" /> Hermes Agent</kbd></a> &nbsp;
  <a href="https://devin.ai/cli"><kbd><img src="https://www.google.com/s2/favicons?domain=devin.ai&sz=64" alt="Devin logo" width="16" valign="middle" /> Devin</kbd></a> &nbsp;
  <a href="https://block.github.io/goose/docs/quickstart/"><kbd><img src="https://www.google.com/s2/favicons?domain=goose-docs.ai&sz=64" alt="Goose logo" width="16" valign="middle" /> Goose</kbd></a> &nbsp;
  <a href="https://docs.augmentcode.com/cli/overview"><kbd><img src="https://www.google.com/s2/favicons?domain=augmentcode.com&sz=64" alt="Auggie logo" width="16" valign="middle" /> Auggie</kbd></a> &nbsp;
  <a href="https://github.com/autohandai/code-cli"><kbd><img src="https://www.google.com/s2/favicons?domain=autohand.ai&sz=64" alt="Autohand Code logo" width="16" valign="middle" /> Autohand Code</kbd></a> &nbsp;
  <a href="https://github.com/charmbracelet/crush"><kbd><img src="https://www.google.com/s2/favicons?domain=charm.sh&sz=64" alt="Charm logo" width="16" valign="middle" /> Charm</kbd></a> &nbsp;
  <a href="https://docs.cline.bot/cline-cli/overview"><kbd><img src="https://www.google.com/s2/favicons?domain=cline.bot&sz=64" alt="Cline logo" width="16" valign="middle" /> Cline</kbd></a> &nbsp;
  <a href="https://www.codebuff.com/docs/help/quick-start"><kbd><img src="https://www.google.com/s2/favicons?domain=codebuff.com&sz=64" alt="Codebuff logo" width="16" valign="middle" /> Codebuff</kbd></a> &nbsp;
  <a href="https://commandcode.ai/docs/quickstart"><kbd><img src="https://www.google.com/s2/favicons?domain=commandcode.ai&sz=64" alt="Command Code logo" width="16" valign="middle" /> Command Code</kbd></a> &nbsp;
  <a href="https://docs.continue.dev/guides/cli"><kbd><img src="https://www.google.com/s2/favicons?domain=continue.dev&sz=64" alt="Continue logo" width="16" valign="middle" /> Continue</kbd></a> &nbsp;
  <a href="https://docs.factory.ai/cli/getting-started/quickstart"><kbd><img src="docs/assets/droid-logo.svg" alt="Droid logo" width="16" valign="middle" /> Droid</kbd></a> &nbsp;
  <a href="https://kilo.ai/docs/cli"><kbd><img src="https://raw.githubusercontent.com/Kilo-Org/kilocode/main/packages/kilo-vscode/assets/icons/kilo-light.svg" alt="Kilocode logo" width="16" valign="middle" /> Kilocode</kbd></a> &nbsp;
  <a href="https://www.kimi.com/code/docs/en/kimi-code-cli/getting-started.html"><kbd><img src="https://www.google.com/s2/favicons?domain=moonshot.cn&sz=64" alt="Kimi logo" width="16" valign="middle" /> Kimi</kbd></a> &nbsp;
  <a href="https://kiro.dev/docs/cli/"><kbd><img src="https://www.google.com/s2/favicons?domain=kiro.dev&sz=64" alt="Kiro logo" width="16" valign="middle" /> Kiro</kbd></a> &nbsp;
  <a href="https://github.com/mistralai/mistral-vibe"><kbd><img src="https://www.google.com/s2/favicons?domain=mistral.ai&sz=64" alt="Mistral Vibe logo" width="16" valign="middle" /> Mistral Vibe</kbd></a> &nbsp;
  <a href="https://github.com/QwenLM/qwen-code"><kbd><img src="https://www.google.com/s2/favicons?domain=qwenlm.github.io&sz=64" alt="Qwen Code logo" width="16" valign="middle" /> Qwen Code</kbd></a> &nbsp;
  <a href="https://support.atlassian.com/rovo/docs/install-and-run-rovo-dev-cli-on-your-device/"><kbd><img src="https://www.google.com/s2/favicons?domain=atlassian.com&sz=64" alt="Rovo Dev logo" width="16" valign="middle" /> Rovo Dev</kbd></a> &nbsp;
  <kbd>+ any CLI agent</kbd>
</p>

---

## Install

### To use this fork — build from source

Every download channel below is **upstream (stablyai/orca)** and carries none of
this fork's changes. To get [what this fork adds](#what-this-fork-adds), build it
yourself.

```bash
git clone https://github.com/machamy/orca.git
cd orca
pnpm install
pnpm build:mac        # build:linux on Linux, build:win on Windows
```

The app lands in `dist/mac-arm64/Orca.app` (`dist/mac` for Intel). An app you
built on your own machine carries no quarantine attribute, so Gatekeeper never
gets in the way.

- **Requires** Node 24 and pnpm 10.24.0.
- **Do not touch repo files while `build:mac` runs.** It packages x64 and arm64
  from one file scan, so a file that changes size in between shifts every
  `app.asar` offset and the arm64 app then dies at launch with **no log output at
  all**. The x64 build looks fine, which makes this easy to misdiagnose. To check
  a build, run the packed binary directly
  (`dist/mac-arm64/Orca.app/Contents/MacOS/Orca`): a silent exit 1 with zero
  output means a displaced asar — rebuild without writing to the repo.

### Desktop — macOS, Windows, Linux (upstream builds, without this fork's changes)

- **[Download from onOrca.dev](https://onorca.dev/download)**
- Or grab a build directly: [macOS Apple Silicon](https://github.com/stablyai/orca/releases/latest/download/orca-macos-arm64.dmg) · [macOS Intel](https://github.com/stablyai/orca/releases/latest/download/orca-macos-x64.dmg) · [Windows (.exe)](https://github.com/stablyai/orca/releases/latest/download/orca-windows-setup.exe) · [Linux AppImage](https://github.com/stablyai/orca/releases/latest/download/orca-linux.AppImage) · [All builds](https://github.com/stablyai/orca/releases/latest)
- Running `orca serve` on a headless Linux server? See the [headless Linux server guide](docs/reference/headless-linux-server.md).

_Or via a package manager:_

```bash
# macOS (Homebrew)
brew install --cask stablyai/orca/orca

# Arch Linux (AUR) — or stably-orca-git to build from source
yay -S stably-orca-bin
```

### Mobile Companion — iOS, Android

Pair with your desktop app to monitor and steer your agents from your phone.

- **iOS:** [Download on the App Store](https://apps.apple.com/us/app/orca-ide/id6766130217) or [join TestFlight](https://testflight.apple.com/join/YjeGMQBA)
- **Android:** [Download APK 0.0.43](https://github.com/stablyai/orca/releases/download/mobile-android-v0.0.43/app-release.apk) · [Install guide](https://www.onorca.dev/docs/android-apk)

---

## Community &amp; Support

- **Discord:** Join the community on **[Discord](https://discord.gg/fzjDKHxv8Q)**.
- **Twitter / X:** Follow **[@orca_build](https://x.com/orca_build)** for updates and announcements.
- **WeChat:** Scan to join the Orca community WeChat group 7.

  <img src="docs/assets/wechat-qr-group7.jpg" alt="WeChat group 7 QR code for the Orca community" width="160" />

- **Feedback &amp; Ideas:** We ship fast. Missing something? [Request a new feature](https://github.com/stablyai/orca/issues).
- **Privacy:** See the [privacy &amp; telemetry docs](https://www.onorca.dev/docs/telemetry) for what anonymous usage data Orca collects and how to opt out.
- **Show Support:** [Star](https://github.com/stablyai/orca) this repo to follow along with our daily ships.

---

## Developing

Want to contribute or run locally? See our [CONTRIBUTING.md](.github/CONTRIBUTING.md) guide.

<a href="https://github.com/stablyai/orca/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=stablyai/orca" alt="Orca contributors" />
</a>

<p align="center">
  <img src="docs/assets/star-history.png" alt="GitHub star history chart for stablyai/orca" width="880" />
</p>

## Signed Builds
Windows code signing sponored/provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## License

Orca is free and open source under the [MIT License](LICENSE).
