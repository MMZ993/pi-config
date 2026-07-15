---
description: Implement one small, well-understood change without session planning
argument-hint: "[task]"
---

Implement one focused, low-risk change. Load and follow the available `application-development` skill before proceeding.

<context>
- Read `.agents/PRD.md`, `.agents/RULES.md`, and `.agents/HANDOFF.md` when present.
- Inspect the relevant code and nearby tests before editing.
- If the request is unclear, ask one focused question.
</context>

<scope>
- Keep the work to one coherent, well-understood behavior or addition.
- Do not create a session plan or td task.
- If the work needs a design decision, touches multiple independently changing areas, has unclear acceptance criteria, or grows beyond a focused change, stop and recommend `/plan` instead.
</scope>

<workflow>
1. When a focused automated test is reasonable, load and follow the `write-tests` skill before implementation.
2. For documentation, configuration, scripts, or other changes where a test is not proportionate, state why before proceeding without one.
3. Implement the minimum required change without expanding scope.
4. Load and follow the `verify` skill for the relevant checks.
5. If verification fails, load and follow the `debugging` skill before changing code again.
</workflow>

Do not commit, create a handoff, or request a separate review unless the user explicitly asks.

Task: $@
