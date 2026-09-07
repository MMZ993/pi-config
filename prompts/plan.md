---
description: Create a build-aware session plan and synchronize the td backlog
argument-hint: "[scope]"
---

Create a focused implementation plan for the current session. Load and follow the available `application-development` skill before proceeding.

<context>
- Read `.agents/PRD.md`, `.agents/RULES.md`, and `.agents/HANDOFF.md` when present.
- `td` is required for this workflow. If the repository does not yet have td tracking, run `td init` before continuing. Then run `td task list` to inspect the existing backlog.
- Inspect relevant code to understand scope, dependencies, existing patterns, and test conventions. Route broad exploration through the `explore` and `codebase-memory` skills when practical; directly inspect only the specific files the plan will change.
- Use `ctx7` when a library, framework, API, syntax, or version decision requires current documentation.
</context>

<planning>
- Derive work from approved requirements, carry-over context, and open td tasks.
- If scope is unclear, ask one focused question before planning.
- If `.agents/PLAN.md` contains unchecked tasks, carry them into the new plan or record them as carry-over in `## Notes` rather than silently dropping them.
- Create or update td tasks without duplicates. Each task must be a coherent unit that can reasonably complete in one session.
- Split tasks that affect more than three unrelated areas or require more than four distinct implementation steps.
- Order tasks by dependency, with foundational work first.
- For each planned task, identify the intended behavior, likely affected modules or files, established patterns to follow, and the relevant test or verification command.
- Make every task executable by a fresh session with no planning context: name full repo-relative paths, embed the context a new session needs, and define non-obvious terms. Specify contracts, not implementation bodies.
- For significant unknowns, plan an explicit de-risking or prototyping task first, with criteria for promoting or discarding its result.
- Do not mark selected td tasks `in_progress` until the plan passes its review.
</planning>

<output>
Write `.agents/PLAN.md` using this structure:

```md
# Session Plan — <date>

## Goal
<one sentence>

## Tasks
- [ ] <implementation-level task> (td:<task-id>)
  - Behavior: <expected observable outcome; reference PRD requirement ids when they exist>
  - Scope: <likely modules or files>
  - Interfaces: <new or changed signatures, types, or data shapes; omit for config or doc-only changes>
  - Verification: <command and expected observable outcome>

## Decision Log
- <decision> — <rationale> (<date>)

## Notes
<constraints, decisions, risks, and carry-over context>
```

For significant or multi-session plans, request an independent plan review via `subagent_run` (read-only tools plus `bash` for `td` inspection, top-tier model) against the PRD/RULES, affected code, and the `td` backlog (the reviewer may run `td task list` and `td task show` read-only); address Critical and Important findings and present the revised plan. Skip it for small or single-session plans.

After the review passes, mark the selected td tasks `in_progress`, present the final plan, and state that `/dev` can begin.
</output>

Requested scope: $@
