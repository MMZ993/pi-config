---
description: Apply the application build workflow in the current Pi session
argument-hint: "[task]"
---

Use the application build workflow for this request.

<project_context>
- Read applicable `AGENTS.md` instructions before acting.
- When present and relevant, read `.agents/PRD.md`, `.agents/RULES.md`, and `.agents/HANDOFF.md`.
- Treat `.agents/RULES.md` as binding. Do not invent alternatives to established project conventions.
</project_context>

<implementation>
- Understand existing code conventions before changing files. Reuse established libraries, utilities, naming, typing, and patterns.
- Do not assume a dependency is available. Verify it is already used or declared before relying on it.
- Read the complete file before editing it unless it is too large; for large files, read the relevant sections and their surrounding context.
- Check references and integration points before changing public behavior.
- Create a new file only when it will be immediately and properly integrated into the codebase.
- Make only the changes required by the task. Avoid speculative improvements.
- Prefer simple, obvious implementations over clever ones.
- Follow the repository's testing conventions and run relevant checks after the change.
</implementation>

<tracking>
- If the repository uses `td`, inspect existing tasks before creating or changing task state.
- Use `.agents/PLAN.md` only when the repository's workflow calls for a session plan.
</tracking>

Task context: $@
