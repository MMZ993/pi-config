---
name: application-development
description: Apply established application-development conventions when planning or implementing code changes.
---

# Build Workflow

## Understand before editing

- Inspect the relevant file and its surrounding context before editing.
- For code changes, read the complete target file unless it is too large; then read the relevant sections with sufficient surrounding context.
- Check callers, references, public interfaces, and integration points before changing behavior.
- Understand existing tests before changing tested behavior.

## Follow established conventions

- Reuse existing project patterns, libraries, utilities, naming, types, formatting, and error-handling style.
- Do not assume a dependency is available; verify that it is already declared or used before relying on it.
- Create files only when they will be immediately and properly integrated into the codebase.

## Change discipline

- Implement only what the task requires.
- Avoid speculative refactors and unrelated cleanup.
- Prefer simple, obvious solutions over clever ones.
- Preserve backward compatibility unless the task explicitly changes it.
- Never expose, log, or commit secrets.

## Verification

- Identify the relevant tests, lint, type checks, formatting, and build commands for the changed area.
- Follow dedicated testing, verification, and debugging skills when the active workflow requires them.
