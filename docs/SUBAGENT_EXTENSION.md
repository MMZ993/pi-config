# Subagent extension

This extension delegates one bounded task to an isolated Pi process running inside a tmux session.

## Tools

- `subagent_run` starts a worker with a required task, optional working directory, narrow tool allowlist, and timeout; it blocks by default and returns only the final report.
- `subagent_status` reports a worker's state, elapsed time, last structured activity, artifact paths, and tmux attach command.
- `subagent_cancel` explicitly terminates a worker's tmux session.

## Lifecycle

- Workers run `pi --mode json --print --no-session` within a unique tmux session and write prompt, event, stderr, and completion artifacts to a retained directory under `/tmp`.
- Blocking calls wait for completion for 300 seconds by default. `onTimeout: "terminate"` stops the worker; `onTimeout: "keep_running"` returns a tracked background run.
- Background calls return immediately. The parent TUI shows only the count of running workers; worker events are not streamed into parent-agent context.
- Completion is injected as a custom message only into the session that launched the worker. A different or fresh Pi session never receives it.
- On session shutdown, active workers remain in tmux and their artifacts are retained. The extension warns in the TUI; a resumed originating session reconciles its own workers.

## Safety

- The default child allowlist is `read` only. Callers must explicitly request additional tools.
- Workers receive an explicit instruction not to commit, push, deploy, access credentials, or perform external side effects without user approval.
- The extension never downloads binaries and requires `tmux` and `pi` on `PATH`.

## References

- `skills/invoke-subagent/SKILL.md`
- Pi extension documentation: `docs/extensions.md`
