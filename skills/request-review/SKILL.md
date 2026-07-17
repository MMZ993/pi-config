---
name: request-review
description: Obtain an independent read-only review in a fresh Pi process running in tmux for significant or user-requested work. Skip it for straightforward low-risk changes.
---

# Request Review

Use a separate Pi process so the reviewer has no implementation-session context and cannot modify the repository.

## When to use this skill

Use an independent review when the user requests one or the change involves a new feature, bug fix, security or access-control behavior, schema or migration work, public API or CLI behavior, non-obvious multi-file logic, or a production infrastructure change with meaningful blast radius.

Do not use an independent review solely because a commit is requested. Skip it for established-pattern one-line configuration edits, CI diagnostic or artifact changes, documentation or formatting changes, narrowly scoped dependency pins, and trivial test-only changes. For skipped reviews, inspect the complete diff locally and run proportionate verification.

## Preconditions

- Stop implementation before starting the reviewer; do not modify the workspace while it runs.
- Complete the relevant verification first.
- The reviewer must receive an immutable Git snapshot. Do not give it `bash`: the reviewer is limited to `read,grep,find,ls` and can inspect source files but cannot mutate state or run Git.

## Create the review snapshot

From the repository root, create a unique temporary directory and capture, before launching the reviewer:

```bash
review_dir=$(mktemp -d "${TMPDIR:-/tmp}/pi-review.XXXXXX")
git status --short >"$review_dir/status.txt"
git diff --no-ext-diff >"$review_dir/unstaged.diff"
git diff --cached --no-ext-diff >"$review_dir/staged.diff"
git ls-files --others --exclude-standard >"$review_dir/untracked.txt"
git log --oneline -10 >"$review_dir/recent-commits.txt"
```

Write `$review_dir/prompt.md` with this review policy, followed by the supplied context below. This policy is embedded here so the temporary prompt is self-contained regardless of where the Pi package is installed.

```md
Perform a read-only code review of the supplied repository snapshot and current workspace files. This is a review session, not an implementation session. You have no knowledge of the implementation session; evaluate the work independently.

Do not edit, write, stage, commit, reset, push, or otherwise modify repository or external state. Do not run tests or commands that may modify files, caches, services, or external state. You have only `read`, `grep`, `find`, and `ls`; do not attempt Git commands. Treat the supplied Git snapshot as the authoritative status and diff.

Read applicable `AGENTS.md` instructions and `.agents/RULES.md` when present. Read changed files and enough surrounding code to understand behavior and integration points. Compare changes against the supplied plan and requirements. Review correctness, regressions, security, error handling, test coverage, conventions, documentation, and unnecessary scope. Report only actionable findings.

For each finding, provide severity (Critical, Important, or Minor), file path and line number, concise evidence and impact, and a specific correction. List findings in severity order. If no actionable findings exist, say so explicitly.

## Review

### Plan adherence
<specific assessment>

### Findings
<findings grouped by severity; omit empty categories>

### Assessment
Ready to proceed | Needs fixes before proceeding
<one-sentence overall quality assessment>

End with unverified assumptions or checks intentionally not run.
```

Append:

- the plan goal and completed tasks from `.agents/PLAN.md`, when present;
- decisions, deviations, known risks, and requested focus;
- the literal contents of all five snapshot files above;
- an instruction to use only the supplied snapshot for Git state and to inspect relevant workspace files with its read-only tools.

## Launch and collect

Use a unique tmux session name. Never reuse or kill a pre-existing session. Launch Pi from the repository root with no `bash` tool and capture its report separately:

```bash
session_name="pi-review-$(date +%s)-$$"
report="$review_dir/report.md"
error="$review_dir/error.log"

tmux new-session -d -s "$session_name" -c "$(git rev-parse --show-toplevel)" \
  "pi --print --no-session --tools read,grep,find,ls @'$review_dir/prompt.md' >'$report' 2>'$error'"

if ! timeout 300 sh -c "while tmux has-session -t '$session_name' 2>/dev/null; do sleep 1; done"; then
  tmux kill-session -t "$session_name" 2>/dev/null || true
  echo "Reviewer timed out; diagnostics: $error"
fi

if [ ! -s "$report" ]; then
  echo "Reviewer returned no report; diagnostics: $error" >&2
  exit 1
fi
```

Read `$report` and `$error`. Clean up only the tmux session and temporary directory created by this run, after the report has been returned or copied into the session context.

## Act on findings

- Fix Critical and Important findings, rerun verification, and request a new review.
- Record Minor findings in `.agents/HANDOFF.md` when not fixing them now.
- Assess findings on their evidence; do not implement incorrect feedback blindly.
