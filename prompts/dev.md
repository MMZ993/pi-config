---
description: Execute the approved session plan with test-first implementation and verification
argument-hint: "[instructions]"
---

Execute the approved session plan. Load and follow the available `application-development` skill before proceeding.

<preconditions>
- Require `.agents/PLAN.md`. If it does not exist, stop and ask the user to run `/plan` first.
- Require initialized td tracking. If it is absent, stop and ask the user to run `/plan`, which initializes td for this workflow.
- Read `.agents/PLAN.md`, `.agents/RULES.md`, and `.agents/HANDOFF.md` when present.
- Work through tasks in order. Do not begin the next task until the current task is verified or a blocker has been surfaced.
</preconditions>

<task_loop>
For each unchecked task:

1. Confirm the task has a `td:<task-id>` reference. If it is not already `in_progress`, update it to that status before implementation.
2. Load and follow the `write-tests` skill before implementation when the task is testable. For documentation, configuration, or other changes that cannot reasonably use a test, state why.
3. Implement the minimum change required by the task.
4. When implementation forces a design decision, resolve it and append it to the plan's Decision Log, keeping the plan a living document.
5. Load and follow the `verify` skill for the task's planned verification and relevant broader checks. Do not treat pre-existing failures as introduced failures; report them clearly.
6. If verification fails, load and follow the `debugging` skill before changing code again. Do not guess or make random symptom fixes.
7. Mark the task complete in `.agents/PLAN.md` and close its td task only after verification passes.
</task_loop>

<completion>
- When all tasks are complete, stop implementation and load and follow the `request-review` skill.
- Address Critical and Important review findings, then repeat verification and review.
- Commit only when explicitly requested and after review is clean; then load and follow the `commit` skill.
- If the repository uses handoff files, load and follow the `session-wrapup` skill.
</completion>

<stop_conditions>
Resolve ambiguities autonomously using `.agents/PLAN.md`, `.agents/RULES.md`, and `.agents/PRD.md`; record significant decisions in the plan's Decision Log and reflect them in the plan. Stop and ask only when a decision would change scope, contracts, or external behavior, or when the root cause of a failure cannot be identified.
</stop_conditions>

Additional instructions: $@
