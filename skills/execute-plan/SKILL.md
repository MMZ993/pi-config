---
name: execute-plan
description: Execute an approved multistep implementation plan with testing, review, and completion evidence.
---

# Execute an approved plan

<preconditions>
- Load and follow `application-development`.
- Require an approved `.agents/PLAN.md`. If it is missing or not approved, stop and ask the user to run `/plan` or approve the plan as appropriate.
- Read `.agents/PLAN.md` and any applicable `.agents/RULES.md`, `.agents/PRD.md`, and `.agents/HANDOFF.md`.
- Use `td` if the repository uses it; do not require or initialize it solely for this workflow.
- Work through tasks in dependency order. Independent tasks may run concurrently when their scopes do not conflict. Do not start a dependent task until its prerequisites are verified; surface blockers without marking blocked work complete.
</preconditions>

<task_loop>
For each unchecked task:

1. If the repository uses `td`, confirm the task has a `td:<task-id>` reference. If it is not already `in_progress`, update it to that status before implementation.
2. Satisfy the task's dependencies before starting. Record any pending worker, CI job, or external response, the completion evidence required, and when to check again or report a blocker. Submitting work, waiting for it, and verifying its result are separate steps; do not mark a task complete while required evidence is pending.
3. Load and follow `write-tests` before implementation when the task is testable. For documentation, configuration, or other changes that cannot reasonably use a test, state why.
4. Implement the minimum change required by the task.
5. When implementation forces a design decision, resolve it and append it to the plan's Decision Log, reflecting the decision in the plan and keeping it a living document.
6. Load and follow `verify` for the task's planned verification and relevant broader checks. Do not treat pre-existing failures as introduced failures; report them clearly.
7. If verification fails, load and follow `debugging` before changing code again. Do not guess or make random symptom fixes.
8. Mark the task complete in `.agents/PLAN.md` and close its `td` task when applicable only after verification and required completion evidence pass.
</task_loop>

<completion>
- When all tasks are complete, stop implementation and load and follow `request-review`.
- Address Critical and Important review findings, then repeat verification and review.
- Commit only when explicitly requested and after review is clean; then load and follow `commit`.
- If the repository uses handoff files, load and follow `session-wrapup`.
</completion>

<stop_conditions>
Resolve routine ambiguities autonomously using `.agents/PLAN.md`, `.agents/RULES.md`, and `.agents/PRD.md`; record significant decisions in the plan's Decision Log and reflect them in the plan. Stop and ask when a decision would change scope, contracts, or external behavior, or when the root cause of a failure cannot be identified.
</stop_conditions>
