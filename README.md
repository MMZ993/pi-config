# Pi Configuration

Reusable, versioned configuration for the Pi coding agent.

## Contents

- `extensions/safety-net.ts` — blocks catastrophic shell commands and asks for confirmation before destructive operations.
- `skills/` — application development, infrastructure operations, tests, verification, debugging, review, commits, handoffs, Firecrawl research, and CBM CLI exploration.
- `prompts/` — `/brainstorm`, `/prepare-rules`, `/survey-codebase`, `/build`, `/plan`, `/dev`, `/quickfix`, `/devops`, and `/review`.

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
