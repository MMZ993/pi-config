---
name: session-wrapup
description: Record a completed development session in .agents/HANDOFF.md and reconcile its td tasks. Use after all planned work, verification, and review are complete.
---

# Session Wrap-Up

## Check completion

1. Read `.agents/PLAN.md` when present. Every planned task must be checked off before wrap-up.
2. If tasks remain unchecked, stop and ask whether to complete, carry over, revise, or drop them. Do not silently close the session.
3. Inspect the existing `.agents/HANDOFF.md` when present and account for its previous next steps.

## Reconcile tracking

- For completed tasks with `td:<task-id>` references, verify their state with `td task list` and close only tasks that have passed verification.
- Leave incomplete work open and record its blocker or revised scope.
- Do not create new backlog items unless the user asks or the active project workflow requires it.

## Documentation and handoff

Check whether the completed change requires README or other documentation updates. Then write or update `.agents/HANDOFF.md`:

```md
# Next Session

## Previous Session Summary
<completed features, fixes, tests, changed files, and decisions>

## Verification and Review
<commands run and results; review outcome and unresolved minor findings>

## Remaining Tasks
<unfinished work, status, and blockers>

## Next Steps
<prioritized, actionable next work>

## Important Notes
<risks, constraints, trade-offs, and carry-over context>

## Previous HANDOFF.md Review
<what happened to prior next steps, when applicable>
```

Do not claim the session is complete when verification or review failed. Present the handoff result for the user to review.
