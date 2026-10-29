---
name: planning
description: Plan complex, ambiguous, or multistep implementation work before execution, including dependencies and approval.
---

# Planning

<context>
- Load and follow `application-development`.
- Read `.agents/PRD.md`, `.agents/RULES.md`, and `.agents/HANDOFF.md` when present.
- If the repository uses `td`, run `td task list` to inspect the backlog. Do not initialize a tracker solely for this workflow.
- Inspect relevant code, dependencies, established patterns, and test conventions. Route broad exploration through `explore` and `codebase-memory` when practical; directly inspect the specific files the plan will change.
- Use `ctx7` when a library, framework, API, syntax, or version decision requires current documentation.
</context>

<planning>
- Derive work from approved requirements, carry-over context, and open tracker tasks when applicable.
- If scope is unclear, ask one focused question before planning.
- If `.agents/PLAN.md` contains unchecked tasks, carry them into the new plan or record them as carry-over in `## Notes` rather than silently dropping them.
- If the repository uses `td`, create or update tasks without duplicates and include their IDs in the plan.
- Each task must be a coherent unit that can reasonably complete in one session. Split tasks that affect more than three unrelated areas or require more than four distinct implementation steps.
- Order tasks by dependency, with foundational work first. Independent tasks may run concurrently.
- For each task, identify the intended behavior, likely affected modules or files, established patterns to follow, and the relevant test or verification command and expected outcome.
- Make every task executable by a fresh session with no planning context: name full repo-relative paths, embed the context a new session needs, and define non-obvious terms. Specify contracts, not implementation bodies.
- For significant unknowns, plan an explicit de-risking or prototyping task first, with criteria for promoting or discarding its result.
- For asynchronous dependencies, record pending workers, CI jobs, or external responses, what proves their completion, and when to check again or report a blocker. Submission is not completion.
- Do not mark tracker tasks in progress before review and user approval; execution marks applicable tasks in progress.
</planning>

<output>
Write or update `.agents/PLAN.md` using this structure; omit tracker IDs when the repository does not use a tracker and interfaces for config or documentation-only changes:

```md
# Session Plan — <date>

## Goal
<one sentence>

## Tasks
- [ ] <implementation-level task> (td:<task-id>)
  - Behavior: <expected observable outcome; reference PRD requirement IDs when they exist>
  - Scope: <full repo-relative paths and established patterns>
  - Interfaces: <new or changed signatures, types, or data shapes>
  - Verification: <command and expected observable outcome>

## Decision Log
- <decision> — <rationale> (<date>)

## Notes
<constraints, decisions, risks, dependencies, and carry-over context>
```

For significant or multi-session plans, load `invoke-subagent` and request an independent review via `subagent_run` using a top-tier approved model and read-only tools, plus `bash` only for read-only tracker inspection. Review against the PRD, RULES, affected code, and existing backlog; address Critical and Important findings and present the revised plan. Skip review for small or single-session plans.

Present the final plan and obtain user approval before execution. Once approved, `/dev` can begin.
</output>
