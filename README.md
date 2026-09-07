# Pi Configuration

Reusable, versioned configuration for the Pi coding agent.

## Contents

- `extensions/safety-net.ts` — blocks catastrophic shell commands and asks for confirmation before destructive operations.
- `extensions/ask-user.ts` — exposes the `ask_user` tool for one necessary multiple-choice clarification, including a custom-answer option.
- `extensions/tokyonight-header.ts` — replaces Pi's startup logo with a Tokyo Night Pi logo while retaining Pi's built-in resource summary; `/default-header` restores Pi's built-in header.
- `extensions/system-guidance.ts` and `system-prompt/APPEND_SYSTEM.md` — append package-owned global operating guidance without replacing Pi or project instructions.
- `extensions/subagents/` — delegates bounded tasks to isolated Pi workers in tracked tmux sessions; see `docs/SUBAGENT_EXTENSION.md`.
- `extensions/bg-terminal/` — runs non-interactive shell commands in tracked detached tmux sessions; see `docs/BG_TERMINAL_EXTENSION.md`.
- `extensions/copy-all.ts` — adds `/copy-all` to copy the active session's readable conversation transcript to the clipboard.
- `extensions/file-search.ts` — replaces Pi's built-in `fd` and `rg` tools with system-managed binaries, hardened argument handling, and compact call/result rendering.
- `skills/` — application development, infrastructure operations, tests, verification, debugging, review, commits, handoffs, Firecrawl research, CBM CLI exploration, and cheap-model exploration via subagents.
- `prompts/` — `/brainstorm`, `/prepare-rules`, `/survey-codebase`, `/build`, `/plan`, `/dev`, `/quickfix`, `/devops`, and `/review`.
- `themes/tokyonight.json` — Tokyo Night color theme for Pi's TUI.

Machine-wide settings and the shared system prompt are managed separately by dotfiles under `~/.pi/agent/`. Credentials, trust decisions, sessions, and installed package directories are not managed here.

## Workflows

- Use `/build <task>` (or compatibility `/quickfix <task>`) for one small, well-understood change. It applies proportionate tests and verification without planning, review, handoff, or commit by default.
- Use `/plan <scope>` for multi-step work. It creates `.agents/PLAN.md` and synchronizes `td` tasks after confirmation.
- Use `/dev` to execute an approved plan with test-first implementation, verification, independent read-only review, optional explicit commit, and handoff.
- Use `/devops <task>` for infrastructure work. State-changing and destructive operations require explicit confirmation.
- Use `/review [focus]` in a fresh session for a read-only review. The `request-review` skill defines the isolated tmux worker used by `/dev`.

## Installation

Publish a reviewed tag, then add it to Pi's global settings through dotfiles:

```json
{
  "packages": [
    "npm:pi-effort@0.0.5",
    "git:gitlab.mmz.sh/mmz-personal/pi-config@<tag>"
  ]
}
```

For local development only:

```bash
pi install /absolute/path/to/pi-config
```

## Security

Packages, extensions, and skills can execute with the user's privileges. Review changes before tagging or installing them. Do not commit credentials, tokens, session transcripts, or generated dependency directories.
