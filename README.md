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
- `prompts/` — `/brainstorm`, `/prepare-rules`, `/survey-codebase`, `/build`, `/plan`, `/dev`, and `/devops`.
- `themes/tokyonight.json` — Tokyo Night color theme for Pi's TUI.

Machine-wide settings and the shared system prompt are managed separately by dotfiles under `~/.pi/agent/`. Credentials, trust decisions, sessions, and installed package directories are not managed here.

## Workflows

**On-ramps** — create the project's baseline documents once:

- Owned application: `/brainstorm <idea>` defines requirements in `.agents/PRD.md`, then `/prepare-rules` derives `.agents/RULES.md` from the approved PRD.
- Existing or forked repository: `/survey-codebase` derives `.agents/RULES.md` from observed conventions; no PRD is created.

**Development** — iterate:

- `/plan <scope>` — multi-step work. Creates `.agents/PLAN.md` and synchronizes `td` tasks after confirmation.
- `/dev` — execute an approved plan with test-first implementation, verification, independent read-only review via the `request-review` skill, optional explicit commit, and session handoff. Requires `/plan` first.
- `/build <task>` — one small, well-understood change; tests and verification without planning, review, handoff, or commit by default.
- `/devops <task>` — infrastructure work with tiered confirmation for state-changing and destructive operations.

**Resuming:** every workflow re-reads `.agents/PRD.md`, `.agents/RULES.md`, `.agents/PLAN.md`, and `.agents/HANDOFF.md` when present. Resume multi-step work with `/plan` (it reconciles the existing plan and `td` backlog), then run `/dev` — in the same session if context allows, otherwise in a fresh session. Completed `/dev` sessions record carry-over in `.agents/HANDOFF.md` via the `session-wrapup` skill.

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
