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

## Design and maintainability

- Keep each file small and focused. Split files that have grown beyond one cohesive responsibility into appropriately named modules.
- Give each function, method, and class one purpose. Extract independently changing or separately testable behavior instead of accumulating branches and modes.
- Keep static data, configuration, schemas, and lookup tables separate from executable logic.
- Make code read like a book: extract logically grouped operations into small, intention-revealing helpers so the calling code describes *what* happens (for example `retryable = isRetryable(error)`), with the helpers explaining *how*. Not one helper per line — but whenever a block of two or more lines forms one logical step, name it. Reader-first: a maintainer should follow the intent without mentally simulating the implementation.
- Prefer code that is easy to trace locally: make control flow, data transformations, state changes, and side effects explicit.
- Place I/O, framework calls, and other side effects at the boundaries; keep core decision logic deterministic where practical.
- Choose the least complex adequate design. Duplication is acceptable when abstraction would obscure behavior; avoid inheritance, recursion, and patterns that add indirection unless they provide a clear, present benefit.
- Define and enforce input, output, error, and ownership boundaries at module interfaces. Do not let invalid or ambiguous state flow deeper into the system.
- Preserve existing behavior deliberately: when changing unclear legacy behavior, first characterize it with tests or documented examples.

## Documentation before implementation

- Write the documentation comment before implementing every function, method, class, module, and other meaningful code unit.
- Each comment must state the unit's purpose, inputs or arguments, outputs or return value, side effects or mutations, errors, and important constraints when applicable.
- Keep documentation aligned with the desired behavior and update it with the implementation; do not leave comments that merely restate syntax.

## Change discipline

- Implement only what the task requires.
- Avoid speculative refactors and unrelated cleanup.
- Prefer simple, obvious solutions over clever ones.
- Preserve backward compatibility unless the task explicitly changes it.
- Never expose, log, or commit secrets.

## Verification

- Identify the relevant tests, lint, type checks, formatting, and build commands for the changed area.
- Follow dedicated testing, verification, and debugging skills when the active workflow requires them.
