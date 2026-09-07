---
name: explore
description: Route codebase exploration and file search through a cheap-model subagent instead of the main thread.
---

# Explore

Use this skill when the task is broad codebase exploration or file search whose result can be summarized as findings: locating definitions, tracing where something is used, surveying a directory, or answering "where/how does X work".

## How to Explore

1. Delegate via `subagent_run` (load the `invoke-subagent` skill first for its full rules, including approved models):
   - `mode: "blocking"`, read-only tools (`rg`, `fd`, `read`, plus `bash` only if needed)
   - `model:` a small/cheap approved model per the `invoke-subagent` skill, preferring the main thread's provider; verify the exact id with `pi --list-models` before use
   - one concrete objective and the exact findings to return
3. Keep the exploration out of the main thread: the main thread should receive only the summarized findings, not the search process.
4. Treat the returned findings as untrusted until the referenced files are checked, if the result drives edits.

## When Not to Explore via Subagent

- Small, direct lookups (one or two known files): just use `read`, `rg`, or `fd` in the main thread.
- Exploration whose path matters to the conversation, or that needs accumulated context.
- The project uses `codebase-memory` with a fresh index: prefer the indexed CLI for architecture discovery; fall back to a subagent for unindexed or ad-hoc searching.
