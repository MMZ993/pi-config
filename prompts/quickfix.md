---
description: Implement one small focused change without creating a session plan
argument-hint: "[task]"
---

Implement one small focused change. Load and follow the available `application-development` skill before proceeding.

<scope>
- Read `.agents/RULES.md` and `.agents/HANDOFF.md` when present.
- If the requested change is unclear, ask one focused question.
- If the work is larger than a focused change, stop and recommend `/plan` instead.
- Do not create a session plan or new td task. If the user supplied an existing td task ID, update it only after verification succeeds.
</scope>

<workflow>
1. Write or update a behavior-oriented test before implementation. Run it and confirm it fails for the intended reason.
2. For documentation, configuration, or other genuinely untestable changes, state why a test is not applicable before proceeding without one.
3. Implement the minimum required change without expanding scope.
4. Run the relevant full verification suite. Investigate root cause before changing code again if checks fail.
5. Request a separate fresh Pi session using `/review` before considering the work complete.
6. Commit only when explicitly requested and after review is clean.
</workflow>

Task: $@
