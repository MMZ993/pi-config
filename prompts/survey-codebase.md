---
description: Survey an existing or forked repository and create .agents/RULES.md
argument-hint: "[focus]"
---

Use this workflow for an existing repository or fork. It creates RULES from evidence; it does not create a PRD and must not invent product requirements.

<context_and_resumption>
1. Read `.agents/RULES.md` and `.agents/HANDOFF.md` when present.
2. If RULES already exists, ask whether to update it or replace it before changing it.
3. Use the existing `## Open Questions` section as the resumable survey state. Keep partial findings and unresolved questions when context runs out.
</context_and_resumption>

<survey>
Route broad exploration away from the main thread when practical:

- If the project is indexed (or indexing it is worthwhile), use the `codebase-memory` skill for architecture discovery, structural search, and impact analysis.
- Otherwise, delegate broad searching to a cheap-model subagent via the `explore` and `invoke-subagent` skills; keep only the summarized findings in this session.

Then inspect directly and incrementally for anything that needs accumulated context or verification against source files:

1. List the top-level structure and locate build, dependency, formatter, test, CI, and deployment configuration.
2. Identify languages, runtime versions, package managers, and significant declared or locked dependencies.
3. Read representative production code and tests to establish naming, module boundaries, imports, types, error handling, test structure, and project-specific patterns.
4. Trace relevant callers, interfaces, and integration points before recording behavioral conventions.
5. Use `ctx7` only when current documentation is needed to understand an existing dependency or API. Record project-declared versions, not unrelated latest upstream versions.

Do not make code or infrastructure changes while surveying.
</survey>

<rules>
Record only observed conventions and clearly mark uncertainty. Write `.agents/RULES.md` using this structure:

```md
# Rules

## Stack
<observed languages, frameworks, and key libraries>

## Versions
<versions declared or locked by the repository and their source files>

## Project Structure
<observed module, test, configuration, and documentation layout>

## Conventions
<observed naming, formatting, typing, error handling, and patterns>

## Libraries
<existing library choices and their established uses>

## Documentation
<observed documentation language, doc-comment style, and README or wiki conventions>

## Testing
<observed test framework, placement, and fixtures, plus lint, type-check, format, and build commands>

## Do Not
<observed anti-patterns, prohibited alternatives, and repository constraints>

## Open Questions
<unresolved or insufficiently evidenced findings, or None>
```

Update the file as the survey progresses so another Pi session can continue from it. Show the completed or partial rules, distinguish observed facts from open questions, and ask for confirmation before `/plan` relies on it.
</rules>

Survey focus: $@
