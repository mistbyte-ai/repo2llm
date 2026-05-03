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

Uses `.repo2llm-ignore` (gitignore-compatible).

```bash
repo2llm init-ignore
```

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
