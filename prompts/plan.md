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
  - Behavior: <expected outcome>
  - Scope: <likely modules or files>
  - Verification: <test, lint, type check, or build command>

## Notes
<constraints, decisions, risks, and carry-over context>
```

For significant or multi-session plans, request an independent plan review via `subagent_run` (read-only tools, top-tier model) against the PRD/RULES and affected code; address Critical and Important findings and present the revised plan. Skip it for small or single-session plans.

After the review passes, mark the selected td tasks `in_progress`, present the final plan, and state that `/dev` can begin.
</output>

Requested scope: $@
