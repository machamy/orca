# Local macOS build: app.asar integrity

A local `pnpm run build:mac` can produce an **arm64 app that silently refuses to launch** while the x64 app from the same run is perfectly fine. This page records the failure, how to recognise it, and how to verify a build before installing it.

## Symptom

- `open -a Orca` does nothing; no window, no crash report in `~/Library/Logs/DiagnosticReports/`.
- Running the binary directly exits **1** with **zero** stdout/stderr — even with `ORCA_STARTUP_DIAGNOSTICS=1`:

  ```sh
  /Applications/Orca.app/Contents/MacOS/Orca; echo "exit=$?"
  ```

- With `--enable-logging=stderr -v=1` you still see Chromium initialise (display detection, allocator config) and then nothing. That gap is the tell: **native Electron came up, the main JS bundle never ran.**

Because no JS ever executes, none of the app's own exit paths are involved. For contrast, the single-instance gate exits **3** and logs a `[single-instance]` line, and a `serve` option failure prints before `app.exit(1)`.

## Cause

`build:mac` runs `electron-builder --mac`, which packages **x64 first, then arm64, from a single file-metadata scan**. Sizes and integrity hashes are computed once at the start of the run; each arch pack re-reads the files from disk.

If a repo file is rewritten between the two packs, the arm64 header still carries the *old* size while the *new* bytes get streamed in. Every entry after that file is displaced by the size delta. Electron then reads `package.json` at an offset that lands in the middle of the previous file, gets garbage, and gives up before producing any output.

Observed instance (2026-08-06): an agent wrote `FORK_CHANGELOG.md` while packaging was in flight. The file grew 466 bytes, so 1964 of 1969 arm64 asar entries were displaced by exactly +466. The x64 asar from the same run verified clean.

Near miss (2026-08-22): `.claude/` was not excluded, so `.claude/worktrees/` — whole repo checkouts that subagents work in — was packed into `app.asar`, adding ~76MB to the app (18383 hashed entries instead of 1825). Both arches happened to verify clean because no agent wrote there during that run, but a worktree with a live agent in it is churn by definition. `.claude/tmp/` has the same shape: it is where the codex cross-verify tooling writes its output, so a review running alongside a build lands bytes under the repo root.

The trap in that one: `.claude/` is hidden from `git status` by `.git/info/exclude`, so it looks like it is not part of the repo. **electron-builder does not read git's ignore rules** — it packs everything under the project root that its own `files` globs do not exclude. Git-invisible is not build-invisible.

Note that ASAR integrity validation would have caught this at launch with a clear message, but the `EnableEmbeddedAsarIntegrityValidation` fuse is **disabled** in these builds, so the mismatch surfaces only as a silent exit.

Ad-hoc signing (`config/scripts/sign-local-mac-app.cjs`) is **not** implicated — `codesign --verify --deep --strict` passes because it seals whatever bytes are there, corrupt or not.

## Prevention

1. Make every edit before starting the build; write nothing under the repo root until it exits. This is the actual fix — the exclusions below only narrow the blast radius.
2. `config/electron-builder.config.cjs` excludes the fork-local churn most likely to move mid-build: `FORK_CHANGELOG*.md`, `projects/`, `workspaces/`, `.claude/`. Anything else at the repo root that is not in the exclude list is still packed into `app.asar` and still dangerous — including paths git has been told to ignore.
3. Before starting a build, stop anything that writes under the repo root: background agents in `.claude/worktrees/`, and cross-verify tooling writing to `.claude/tmp/`. The exclusions cover today's known offenders, not tomorrow's.

## Verifying a build

Every asar entry carries a SHA-256 in the header, so a corrupt archive is cheap to detect. Read the header (16-byte prelude; the JSON length is at offset 12, the JSON follows at 16, and payload starts at `8 + uint32@4`), then hash each entry at its recorded offset:

```js
const fs = require('node:fs')
const crypto = require('node:crypto')
const fd = fs.openSync(process.argv[2], 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const base = 8 + head.readUInt32LE(4)
const json = Buffer.alloc(head.readUInt32LE(12))
fs.readSync(fd, json, 0, json.length, 16)

let bad = 0, total = 0
;(function walk(node) {
  for (const entry of Object.values(node.files ?? {})) {
    if (entry.files) { walk(entry); continue }
    if (!entry.integrity) continue
    const buf = Buffer.alloc(entry.size)
    fs.readSync(fd, buf, 0, entry.size, base + Number(entry.offset))
    total++
    if (crypto.createHash('sha256').update(buf).digest('hex') !== entry.integrity.hash) bad++
  }
})(JSON.parse(json.toString('utf8')))
console.log(bad === 0 ? `ok (${total} entries)` : `CORRUPT: ${bad}/${total} mismatched`)
fs.closeSync(fd)
```

Run it against both packs — a clean x64 result says nothing about arm64:

```sh
node verify-asar.js dist/mac-arm64/Orca.app/Contents/Resources/app.asar
node verify-asar.js dist/mac/Orca.app/Contents/Resources/app.asar
```

Anything other than `ok` means rebuild; do not install it.

## After a build: check `git status`

A build can leave the working tree's `package.json` in its *packaged* shape — `version` stamped with the local build string (`1.4.178-rc.2.machamy.7.local.<ts>.<commit>`) and the whole `scripts` block gone. That is `extraMetadata` content that belongs inside `app.asar`, not in the repo.

It is easy to miss and expensive to commit: `git add -A` right after a build sweeps it in, and the result is a repo where every `pnpm run …` is gone and the version is a one-off build id. Restore it before committing:

```sh
git checkout HEAD -- package.json
```

Observed 2026-08-22. The asar itself verified clean on that run, so this is a working-tree hygiene problem rather than an integrity one — but `package.json` is packed into the asar, so a rewrite that lands between the x64 and arm64 packs is also the corruption above.

## Recovering

Rebuild with the repo quiet. Any previously shipped `dist/Orca-*-arm64-mac.zip` that verifies clean is a valid rollback target in the meantime — unzip just the archive to check it without a full install:

```sh
unzip -o -q dist/Orca-<version>-arm64-mac.zip 'Orca.app/Contents/Resources/app.asar' -d /tmp/orca-check
node verify-asar.js /tmp/orca-check/Orca.app/Contents/Resources/app.asar
```
