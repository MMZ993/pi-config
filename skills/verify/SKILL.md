---
name: verify
description: Run and assess the relevant project verification after a code change. Use before declaring a task complete.
---

# Verify Changes

## Select checks

1. Use the project's declared test, lint, type-check, formatting, and build commands from the active workflow context.
2. If commands are not documented, inspect the project's standard configuration (`package.json`, `pyproject.toml`, `Makefile`, CI configuration, or equivalent). Do not invent commands.

## Run checks

- Run the focused test when it helps diagnose the changed behavior, then run the relevant full test suite.
- Run applicable lint, type checks, formatting checks, and build checks after tests.
- Read complete failure output, including file paths, line numbers, warnings, and skipped tests.

## Assess results

A task is verified only when the intended behavior is covered and all relevant checks pass without new warnings, skipped tests, or regressions.

When a check fails:

1. Determine whether it is introduced by the current changes or demonstrably pre-existing.
2. Report pre-existing failures clearly; do not silently accept them.
3. For an introduced or unexplained failure, load and follow the `debugging` skill before changing code again.
4. After a fix, rerun the checks affected by that fix and the relevant broader suite.
