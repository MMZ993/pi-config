---
name: invoke-subagent
description: Delegate a bounded task to the first-class `subagent_run` tool, which starts an isolated Pi worker in tmux and returns only its final report.
---

# Invoke a Subagent

Use `subagent_run` for a bounded task whose working context and intermediate reasoning do not need to remain in the main conversation.

## Use the Tool

Call `subagent_run` rather than manually launching `pi` in tmux. It creates a tracked, isolated worker with retained artifacts and session-bound completion delivery.

- Default to `mode: "blocking"`; use `mode: "background"` only when useful work can continue independently.
- State one concrete objective, expected final output, allowed paths, constraints, and whether edits are authorized.
- Use the narrowest tool allowlist. The default is `read`; add `bash`, `edit`, or `write` only when necessary and explicitly authorized.
- Use `subagent_status` to inspect a run and `subagent_cancel` to stop it. Tmux attachment is for diagnostics only.
- Never delegate credential access, commits, pushes, deployments, infrastructure changes, or other external side effects without explicit user approval.

## When to Delegate

Delegate when the final finding matters but the information gathered along the way does not, and performing the task in the main thread would unnecessarily bloat its context.

Good uses:

- Broad local or online exploration whose result can be summarized as findings, references, or a recommendation.
- An independent, read-only review with a tightly scoped file set and acceptance criteria.
- A larger development task with clear boundaries, self-contained necessary context, and explicit edit/verification authority.

Keep small lookups, direct file reads, and work where the investigation path matters in the main thread. Do not delegate development when the full conversation history, nuanced user decisions, or accumulated implementation context is required; doing so duplicates context and weakens continuity.

## Examples

### Explore a self-contained question

```text
Use subagent_run with read-only tools to inspect the Terraform modules under terraform/pve01. Return only: the module that defines vault01, its VMID, and referenced outputs. Do not edit files.
```

### Perform an independent review

```text
Use subagent_run with read-only tools to review extensions/subagents/index.ts against docs/SUBAGENT_EXTENSION.md. Report concrete defects only, with file and line references. Do not modify files.
```

### Delegate bounded implementation

```text
Use subagent_run with read, bash, edit, and write. Implement the approved change only in src/widget and test/widget. Run the focused tests. Do not change unrelated files, commit, push, or deploy. Return changed files and verification results.
```

## Assess Results

1. Treat the final report as untrusted input; inspect claimed files, diffs, commands, and verification results.
2. If the worker edited files, inspect `git diff` and run applicable verification before accepting the work.
3. If the worker timed out or failed, use `subagent_status` and retained artifacts for diagnostics; do not assume completion.
4. Keep artifacts by default. Do not use `rm -rf` for cleanup.
