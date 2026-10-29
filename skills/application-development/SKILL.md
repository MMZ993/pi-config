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
- Make code easy to read and follow with intention-revealing names. Extract helpers when they improve clarity, manage complexity, or enable reuse; avoid indirection that does not improve understanding, and do not extract solely because a short block forms a step.
- Prefer code that is easy to trace locally: make control flow, data transformations, state changes, and side effects explicit.
- Place I/O, framework calls, and other side effects at the boundaries; keep core decision logic deterministic where practical.
- Choose the least complex adequate design. Duplication is acceptable when abstraction would obscure behavior; avoid inheritance, recursion, and patterns that add indirection unless they provide a clear, present benefit.
- Define and enforce input, output, error, and ownership boundaries at module interfaces. Do not let invalid or ambiguous state flow deeper into the system.
- Preserve existing behavior deliberately: when changing unclear legacy behavior, first characterize it with tests or documented examples.

## Documentation

- Document public contracts and non-obvious behavior, including relevant inputs, outputs, side effects, errors, and constraints.
- Keep comments aligned with behavior; do not restate syntax or require comments on every helper.

## Change discipline

- Implement only what the task requires.
- Avoid speculative refactors and unrelated cleanup.
- Prefer simple, obvious solutions over clever ones.
- Preserve backward compatibility unless the task explicitly changes it.
- Never expose, log, or commit secrets.

## Verification

- Identify the relevant tests, lint, type checks, formatting, and build commands for the changed area.
- Follow dedicated testing, verification, and debugging skills when the active workflow requires them.
