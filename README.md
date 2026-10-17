# repo2llm — Give your entire project to an LLM (properly)

`repo2llm` is a small CLI tool that turns your repository into a **LLM-friendly snapshot**
and provides **incremental diffs** for ongoing work.

It is designed for **real development workflows with LLMs**, not for demos.

---

## Why this exists

Working with LLMs on real projects quickly breaks down:

- You copy-paste files manually
- The model sees only fragments
- It generates patches for outdated files
- It refers to files that don't exist
- You get random regressions

Most tools try to solve this with:

- RAG
- implicit context selection
- “smart” agents

And often introduce new problems:

- missing files
- wrong files
- non-deterministic behavior

---

## What repo2llm does

It gives the model an **explicit, complete, deterministic view** of your project.

```bash
repo2llm snapshot
```

→ full project snapshot

```bash
repo2llm diff
```

→ only changed files

---

## What changes in practice

After switching to repo2llm:

- No more patches to outdated files
- No more "file does not exist" issues
- No more context desync between you and the model
- The model always works with the exact same project state

This eliminates an entire class of LLM-assisted development bugs:
**context desynchronization**.

repo2llm was created to solve real problems encountered during daily LLM-assisted development.

It has been used in real workflows before being published.

---

## Core idea

LLMs do not share your filesystem.

By default, you have:

```
your code ≠ model context
```

repo2llm makes it:

```
your code = model context
```

---

## Related concept

repo2llm is part of a broader workflow for **LLM-assisted development**.

In this workflow, the LLM is not used as a simple "code generator" or snippet rewriter,
but as a **development partner** that operates on the same project state as you.

This requires explicit, synchronized context — not partial prompts or implicit context selection.

A more detailed explanation of this approach:

👉 https://t.me/mistbyteai/16

---

## Workflow

Typical usage:

```bash
repo2llm snapshot > snapshot.txt
```

Paste into LLM.

Make changes.

```bash
repo2llm diff > diff.txt
```

Paste into LLM.

Repeat.

---

## Commands

```bash
repo2llm snapshot
repo2llm diff
repo2llm last-diff
repo2llm map
repo2llm status
repo2llm init-ignore
```

---

## Snapshot and diff metadata

Snapshots and diffs include a SHA-256 manifest and per-file `sha256` values computed
from raw bytes before text normalization, including binary files and SVG assets whose
contents remain skipped. Symlinks and unreadable files report `unavailable` hashes.
Deleted files have no hash. Hashes are informational: diff detection still compares
only modification time, size, and type, so a timestamp-only change still appears.

Git integration is optional. Headers report HEAD, ordinary Git working-tree status,
and counts for the entire current repo2llm file set (including unchanged files in a diff).
Per-file `gitStatus` identifies `tracked` files in the Git index, `untracked` files
outside the index, or `ignored` files excluded by Git rules. Git-ignored files can
still be included by repo2llm. A clean Git working tree therefore does not imply
that every snapshot file exists in HEAD. Missing Git, command failures, and non-Git
directories report unavailable metadata; repositories without commits show `gitHead: -`.

`last-diff` replays the hashes and Git metadata saved with the original diff, even
after HEAD or files change. Older saved diffs remain readable without invented
historical metadata. `map` and `status` output are unchanged.

---

## Status command

```bash
repo2llm status
```

Shows:

- whether state exists
- whether working tree is clean
- whether it matches snapshot or diff

Example:

```
workingTree: clean
stateMatches: diff
```

---

## Ignore rules

Built-in ignore rules are used only when `.repo2llm-ignore` is absent.
They exclude common dependency directories, build artifacts, `.env` and `.env.*`,
and Python caches, compiled files, coverage output, package metadata, and virtual environments.
Without a user ignore file, `snapshot` and `map` work, but snapshots do not create
persistent state and `diff` / `last-diff` are unavailable.

An existing `.repo2llm-ignore` **fully replaces** the built-in defaults.
Rules use gitignore-compatible syntax, including dotfiles, negation (`!`), nested
paths, and directory rules. A leading dot does not automatically exclude a file.
For example:

```gitignore
.env
.env.local
```

This excludes `.env` and `.env.local`, while including `.env.example` and
`.env.production.local` unless another user rule excludes them.

Generate a starting file containing the built-in defaults (including Python rules):

```bash
repo2llm init-ignore
```

An existing ignore file is never overwritten.
An empty `.repo2llm-ignore` disables ordinary default exclusions, so take care
not to include secrets or large dependency directories accidentally.

`.repo2llm-state.json` is always excluded internally, even if a user rule tries
to re-include it with `!`. `.repo2llm-ignore` itself is an ordinary project file:
it is included in snapshots and maps unless explicitly excluded.

---

## Design principles

- No magic
- No hidden context
- No agents
- No RAG
- No API dependencies
- Deterministic behavior

---

## Works with

- ChatGPT
- local LLMs (llama.cpp, etc.)
- any text-based workflow

---

## When to use

Best for:

- small and medium projects (full snapshot fits context)
- large projects (structure + selective usage)
- long conversations with LLM

---

## Compared to other approaches

| Approach | Problem |
|--------|--------|
| Manual copy | incomplete context |
| RAG | missing / wrong files |
| Cursor-style tools | non-deterministic behavior |

repo2llm:

- explicit
- predictable
- reproducible

---

## Installation

### Windows standalone

After **v1.2.0 is published**, `repo2llm-win-x64.exe` will be available on this
repository's **GitHub Releases** page. Download the executable to a tools folder;
no Node.js, npm, or JavaScript dependency installation is required.
Git is optional: without Git, repository metadata is unavailable (`gitAvailable: no`).

Open a shell in the folder containing the executable. The examples below target
`C:\work\My project` and save output outside that project to avoid including the
output files in later snapshots. Review the generated ignore file before taking
a snapshot. A nonempty diff must be generated before `last-diff` can replay it.

PowerShell 7:

```powershell
.\repo2llm-win-x64.exe help
.\repo2llm-win-x64.exe init-ignore "C:\work\My project"
.\repo2llm-win-x64.exe snapshot "C:\work\My project" > "C:\work\snapshot.txt"
# Edit project files before generating a diff.
.\repo2llm-win-x64.exe diff "C:\work\My project" > "C:\work\diff.txt"
.\repo2llm-win-x64.exe last-diff "C:\work\My project" > "C:\work\last-diff.txt"
```

CMD:

```bat
chcp 65001 > nul
repo2llm-win-x64.exe help
repo2llm-win-x64.exe init-ignore "C:\work\My project"
repo2llm-win-x64.exe snapshot "C:\work\My project" > "C:\work\snapshot.txt"
REM Edit project files before generating a diff.
repo2llm-win-x64.exe diff "C:\work\My project" > "C:\work\diff.txt"
repo2llm-win-x64.exe last-diff "C:\work\My project" > "C:\work\last-diff.txt"
```

**Output encoding:** PowerShell 7 defaults to UTF-8; starting with 7.4, native
stdout redirection preserves the original bytes. Windows PowerShell 5.1 uses
UTF-16 LE for `>`. CMD's console encoding depends on its active code page
(`chcp 65001` selects UTF-8), but CMD forwards redirected native stdout without
transcoding; repo2llm writes UTF-8 bytes.
See Microsoft's [character encoding](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding)
and [native redirection](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_redirection#redirecting-output-from-native-commands) documentation.

For reliable UTF-8 output from **Windows PowerShell 5.1**, let CMD perform the
redirection so PowerShell does not decode and re-encode the output:

```powershell
cmd.exe /d /c '.\repo2llm-win-x64.exe snapshot "C:\work\My project" > "C:\work\snapshot.txt"'
```

Use the same form for `diff` and `last-diff`, keeping `>` inside the quoted CMD
command. This preserves the executable's UTF-8 output without changing the app.

The experimental EXE has been cross-built on Linux and tested under Wine.
**Native Windows CI verification is still pending.**

### Node.js / npm

Install dependencies:

```bash
npm install
```

Run directly:

```bash
node repo2llm.js help
```

Optional: make it available as a command:

```bash
npm link
repo2llm help
```

If `repo2llm` is not found after `npm link`, make sure your npm global bin directory is in `PATH`.

Check your npm global prefix with:

```bash
npm prefix -g
```

The executable is usually located in:

```bash
$(npm prefix -g)/bin
```

### Manual Windows build (GitHub Actions)

Maintainers can open **Actions → Build Windows executable → Run workflow** to
build a Windows x64 EXE. The workflow installs the pinned Node.js/build tools,
runs regression and standalone EXE smoke tests, and uploads the tested executable
as the `repo2llm-win-x64` **workflow artifact**. It runs only when manually triggered.

Download the artifact from the successful workflow run. Workflow artifacts are
build outputs with limited retention; they are separate from **GitHub Releases**.
The workflow does not create a tag or publish a release. Attaching the tested EXE
to the v1.2.0 release is a separate publication step.

---

## Notes

- Snapshot size is predictable (~chars / 3 tokens)
- Binary files are skipped but preserved as stubs
- SVG and similar text-based assets are skipped as content but preserved as file entries (structure only)
- No data leaves your machine

---

## Ecosystem

repo2llm is part of a broader approach to **dialog-driven development with LLMs**.

Additional tooling for working with large-context ChatGPT/WebUI workflows is under development.

---

## Updates

Follow for short updates and new experiments around LLM tooling:

👉 https://t.me/mistbyteai

---

## Donations

If this tool saves you time or prevents bugs, consider supporting development:

👉 https://web.tribute.tg/d/Ih8

Development is independent and time-limited — support directly impacts how fast new features appear.

---

## Summary

repo2llm is not trying to be smart.

It is trying to be **correct**.
