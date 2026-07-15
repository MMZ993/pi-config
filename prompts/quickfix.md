---
description: Compatibility command for a small, well-understood change; prefer /build for new use
argument-hint: "[task]"
---

Use the lightweight `/build` workflow for this request. Load and follow the available `application-development` skill before proceeding.

- Read `.agents/PRD.md`, `.agents/RULES.md`, and `.agents/HANDOFF.md` when present.
- Inspect relevant code and nearby tests before editing.
- Keep the work to one coherent, well-understood change; otherwise stop and recommend `/plan`.
- When a focused automated test is reasonable, load and follow `write-tests` before implementation. State why when a test is not proportionate.
- Implement the minimum required change, then load and follow `verify`.
- Load and follow `debugging` before changing code after a verification failure.
- Do not create a session plan, td task, handoff, separate review, or commit unless the user explicitly asks.

Task: $@
