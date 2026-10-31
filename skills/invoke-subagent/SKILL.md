---
name: invoke-subagent
description: Delegate a bounded task to the first-class `subagent_run` tool, which starts an isolated Pi worker in tmux and returns only its final report.
---

# Invoke a Subagent

Use `subagent_run` for a bounded task whose working context and intermediate reasoning do not need to remain in the main conversation.

## Use the Tool

Call `subagent_run` rather than manually launching `pi` in tmux. It creates a tracked, isolated worker with retained artifacts and session-bound completion delivery.

- Default to `mode: "blocking"`; use `mode: "background"` only when useful work can continue independently.
- Choose the child model and reasoning level to fit the task, preferring the smallest model and lowest reasoning level likely to handle it:
  - Use the same provider as the main session: `openai-codex` for GPT models or `zai-coding-cn` for GLM models. If the main session uses another provider or a model not listed below, stop and ask the user which model to use.
  - Verify exact model IDs with `pi --list-models`; never guess them.
  - Approved models, ordered from smallest to strongest:
    - `openai-codex`: `gpt-6-luna` (small), `gpt-6.1-terra` (medium), `gpt-6.1-sol` (strong).
    - `zai-coding-cn`: `glm-5.3-flash` (small), `glm-5.3` (strong; no vision capabilities).
  - Do not automatically escalate to a stronger model just because a task is difficult. If the main session uses a stronger approved model, you may use that model for a subagent when the task warrants it.
  - Do not use a model stronger than the main session's model unless the user explicitly asks.
  - If in doubt, use the main session's model and reasoning level.
- State one concrete objective, expected final output, allowed paths, constraints, and whether edits are authorized. Set `cwd` explicitly when the work belongs in another checkout; pass the intended model and reasoning level explicitly rather than asking the worker to infer them.
- Use the narrowest tool allowlist. The permitted child tools are `read`, `bash`, `edit`, `write`, `fd`, and `rg`; the default is `read`. Add `bash`, `edit`, or `write` only when necessary and explicitly authorized. `subagent_*` and `bg_*` tools are never available to a child.
- Use `subagent_status` to inspect a run, `subagent_result` to retrieve and acknowledge its final report, and `subagent_cancel` to stop it. Tmux attachment is for diagnostics only.
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
Use subagent_run with read-only tools and a cheap model (openai-codex/gpt-6-luna for a GPT main session or zai-coding-cn/glm-5.3-flash for a GLM main session, low effort) to inspect the Terraform modules under terraform/pve01. Return only: the module that defines vault01, its VMID, and referenced outputs. Do not edit files.
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
