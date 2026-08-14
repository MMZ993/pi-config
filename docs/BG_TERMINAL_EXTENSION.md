# Background terminal extension

`bg_start` runs a non-interactive shell command in a unique detached tmux session. It accepts `command`, optional `title`, and optional `cwd`; stdout, stderr, the runner, and exit code remain in a unique `/tmp/pi-bg-terminal-*` directory.

Use `bg_status`, `bg_list`, and `bg_kill` to inspect, list, or terminate jobs. The footer shows the running-job count independently of subagent workers.

Completion notices are persisted and delivered only to the Pi session that started the job. When that session resumes, completed jobs are reconciled once; fresh or unrelated sessions do not receive notices. Jobs and artifacts remain after Pi exits; `tmux` must be installed and on `PATH`.
