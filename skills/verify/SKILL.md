---
name: verify
description: Run and assess proportionate project verification after a code change. Use before declaring a task complete.
---

# Verify Changes

## Select checks

1. Use the project's declared test, lint, type-check, formatting, and build commands from the active workflow context.
2. If commands are not documented, inspect the project's standard configuration (`package.json`, `pyproject.toml`, `Makefile`, CI configuration, or equivalent). Do not invent commands.
3. Match verification cost to change risk:
   - **Trivial documentation, configuration, CI, or formatting change:** inspect the diff, run `git diff --check`, and validate the changed format or project-specific configuration. Do not run unrelated test suites.
   - **Focused code change:** run the focused behavior test when practical, plus directly relevant lint, type, format, or build checks.
   - **Significant or cross-cutting change:** run focused tests and the relevant broader suite.
   - **Infrastructure as code:** run static validation and the repository's dry-run or check command. Never apply infrastructure as verification.

## Run checks

- Run only the checks selected by the change-risk tier. A full suite is warranted only for a significant or cross-cutting change, or when project policy explicitly requires it.
- Read complete output for every executed check, including file paths, line numbers, warnings, and skipped tests.

## Pre-commit hooks

If the repository contains `.pre-commit-config.yaml` or `.pre-commit-config.yml`, run its hooks after the relevant project checks and before final syntax validation:

```bash
pre-commit run --files <changed-and-untracked-files>
```

- Pass only changed and untracked repository files. Do not use `--all-files` unless the user requests a repository-wide validation.
- Hooks may reformat or otherwise modify files. Inspect any resulting diff and rerun the relevant checks and syntax validation for modified files.
- Treat hook failures as verification failures unless they are demonstrably pre-existing or outside the changed scope.

## Fallback syntax validation

After project checks and applicable pre-commit hooks, inspect the changed and untracked files. Run a narrow parser-level check only when the project's checks do not already validate that file type, or when the file is outside their scope. Do this once as the final validation step, not after every edit.

- Skip generated files, vendored dependencies, lockfiles, binary files, and templates whose syntax is intentionally not valid before rendering.
- Use the interpreter or parser already available in the project environment; do not install a language server or a new checker just for validation.
- Use the smallest appropriate check:
  - Python: `python -m py_compile <file>`
  - Bash: `bash -n <file>`
  - JSON: `jq empty <file>`
  - YAML: `yq eval '.' <file>`
  - TOML: `python -c 'import sys, tomllib; tomllib.load(open(sys.argv[1], "rb"))' <file>`
  - Plain JavaScript only: `node --check <file>`; do not use this for TypeScript, JSX, or framework-transformed source.
- For other languages, rely on the project's compiler, formatter, linter, or type checker rather than guessing a generic syntax command.
- Treat a parser failure as a verification failure. Determine whether it is introduced by the current changes before fixing it.

## Assess results

A task is verified only when the intended behavior is covered and all relevant checks and applicable fallback syntax validation pass without new warnings, skipped tests, or regressions.

When a check fails:

1. First distinguish an invalid command invocation (for example, a bad path, typo, or wrong working directory) from a product verification failure. Correct an invalid invocation and rerun it; do not load `debugging` solely for that.
2. Determine whether an actual verification failure is introduced by the current changes or demonstrably pre-existing.
3. Report pre-existing failures clearly; do not silently accept them.
4. For an introduced or unexplained verification failure, load and follow the `debugging` skill before changing code again.
5. After a fix, rerun the checks affected by that fix and only the broader checks warranted by the change-risk tier.
