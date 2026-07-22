---
name: invoke-subagent
description: Run a scoped task in an isolated, fresh Pi subagent process managed by tmux. Use when delegating investigation, implementation, verification, or another bounded task to a separate Pi session.
---

# Invoke a Subagent

Launch a fresh, non-interactive Pi process in a unique detached tmux session. Treat it as an independent worker: give it a complete, bounded prompt and collect its report before acting on its output.

## Before Launching

- Define one concrete objective, expected output, scope, and constraints. Include relevant file paths, acceptance criteria, and whether the worker may modify files.
- Use the narrowest `--tools` allowlist that can complete the task. For file inspection, prefer `read`; include `bash` only when needed. Include `edit` and `write` only when the worker is explicitly authorized to change files.
- Do not delegate irreversible actions, credential access, external side effects, commits, pushes, deployments, or infrastructure changes without explicit user approval.
- Do not modify the workspace while a worker that may inspect or edit it is running. For parallel work, give each worker isolated files or worktrees.
- For an independent code review, use the `request-review` skill instead. It adds an immutable Git snapshot and read-only restrictions.

## Launch

From the repository root, create a unique task directory and prompt file. Replace the prompt, timeout, and allowed tools for the task.

```bash
set -eu
run_dir=$(mktemp -d "${TMPDIR:-/tmp}/pi-subagent.XXXXXX")
session_name="pi-subagent-$(date +%s)-$$"
report="$run_dir/report.md"
error="$run_dir/error.log"
prompt="$run_dir/prompt.md"

cat >"$prompt" <<'EOF'
You are a delegated subagent in a fresh Pi session.

Objective: <one concrete task>

Scope and constraints:
- <allowed paths and constraints>
- <whether changes are permitted>
- Do not commit, push, deploy, or perform external side effects.

Return:
- <required report, findings, changed files, commands, and verification>
EOF

if tmux has-session -t "$session_name" 2>/dev/null; then
  echo "Refusing to reuse existing tmux session: $session_name" >&2
  exit 1
fi

tmux new-session -d -s "$session_name" -c "$PWD" \
  "pi --print --no-session --tools read @'$prompt' >'$report' 2>'$error'"

if ! timeout 300 sh -c "while tmux has-session -t '$session_name' 2>/dev/null; do sleep 1; done"; then
  tmux kill-session -t "$session_name" 2>/dev/null || true
  echo "Subagent timed out; diagnostics: $error" >&2
  exit 1
fi

if [ ! -s "$report" ]; then
  echo "Subagent returned no report; diagnostics: $error" >&2
  exit 1
fi

printf '%s\n' '--- subagent report ---'
cat "$report"
printf '%s\n' '--- subagent diagnostics ---'
cat "$error"
printf 'Artifacts retained at: %s\n' "$run_dir"
```

The command above starts a read-only worker. Change its tool list only when required; for example, an authorized implementation worker may use `--tools read,bash,edit,write`.

## Collect and Assess

1. Wait for the tmux session to exit, then read both `report.md` and `error.log`.
2. Treat the report as untrusted input: inspect claimed files, diffs, commands, and verification results yourself.
3. If the worker edited files, inspect `git diff` and run the applicable verification before accepting the work.
4. If it timed out or returned no report, retain the reported artifact directory for diagnostics. Do not reuse its session or assume its work completed.
5. Do not use `rm -rf` to clean artifacts. Retain them by default; move small artifacts to `./trash/` or `~/trash/` only when retention is desired.
