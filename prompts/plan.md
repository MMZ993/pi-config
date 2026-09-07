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
- If `.agents/PLAN.md` contains unchecked tasks, show the conflict and ask before replacing it.
- Create or update td tasks without duplicates. Each task must be a coherent unit that can reasonably complete in one session.
- Split tasks that affect more than three unrelated areas or require more than four distinct implementation steps.
- Order tasks by dependency, with foundational work first.
- For each planned task, identify the intended behavior, likely affected modules or files, established patterns to follow, and the relevant test or verification command.
- Do not mark selected td tasks `in_progress` until the user confirms the resulting plan.
</planning>

<output>
Write `.agents/PLAN.md` using this structure:

```md
# Session Plan — <date>

## Goal
<one sentence>

## Tasks
- [ ] <implementation-level task> (td:<task-id>)
  - Behavior: <expected outcome>
  - Scope: <likely modules or files>
  - Verification: <test, lint, type check, or build command>

## Notes
<constraints, decisions, risks, and carry-over context>
```

Show the resulting plan and ask for confirmation or corrections before beginning `/dev`.

After the user confirms, mark the selected td tasks `in_progress`.
</output>

Requested scope: $@
