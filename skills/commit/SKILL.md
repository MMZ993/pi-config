---
name: commit
description: Prepare and create reviewed, atomic conventional Git commits after explicit user approval. Use only when the user asks to commit.
---

# Commit Changes

Never commit unless the user explicitly requests it. Review must be clean first when the active workflow requires review.

## Prepare

1. Run `git status` and inspect staged and unstaged diffs.
2. Identify unrelated, generated, or sensitive files. Never stage secrets, credentials, tokens, session data, or unrelated changes.
3. Group related files into atomic commits. One commit must represent one logical concern.
4. Propose the commit plan before staging: files per commit and a conventional commit message. Ask for confirmation if the user has not already approved that exact plan.

## Format

Use `<type>: <description>`, with an imperative, lowercase description and no trailing period.

Common types: `feat`, `fix`, `refactor`, `test`, `docs`, and `chore`.

## Execute

- Stage explicit paths with `git add <path>`; never use `git add .` or `git add -A`.
- Do not use `--no-verify`.
- Commit with the approved message.
- Confirm the result with `git log --oneline -n <count>` and `git status`.
