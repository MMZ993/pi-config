---
description: Derive project rules for an owned application from its PRD
---

Use this workflow for an owned application with a `.agents/PRD.md`. For an existing or forked repository without an owned PRD, use `/survey-codebase` instead.

<context_and_resumption>
1. Read `.agents/PRD.md` in full. If it does not exist, stop and recommend `/brainstorm`.
2. Read `.agents/RULES.md` and `.agents/HANDOFF.md` when present.
3. If RULES already exists, show the user whether the task is an update or overwrite before replacing established rules.
4. Treat `## Open Questions` in either document as resumable work. Preserve unresolved items rather than guessing when the session is resumed.
</context_and_resumption>

<gather_evidence>
- Inspect existing project configuration, representative source files, tests, and CI when they exist.
- For a new project, use `ctx7` to verify the documented API, conventions, and compatible version of each dependency central to the agreed PRD.
- For an existing dependency, record the version declared or locked by the project. Do not replace it with a current upstream version merely because documentation is newer.
</gather_evidence>

<rules>
Every rule must trace to the approved PRD or observed project convention. Write `.agents/RULES.md` using this structure:

```md
# Rules

## Stack
<languages, frameworks, and key libraries>

## Versions
<exact declared, locked, or explicitly chosen versions and their source>

## Project Structure
<where code, tests, configuration, and documentation belong>

## Conventions
<naming, formatting, types, error handling, and patterns>

## Libraries
<approved library choices and prohibited alternatives where relevant>

## Testing
<test framework, placement, and required verification>

## Do Not
<rejected approaches, anti-patterns, and constraints>

## Open Questions
<unresolved decisions, or None>
```

Update the draft as decisions are made so it survives session boundaries. Show the resulting RULES file and ask for confirmation before `/plan` uses it.
</rules>
