# Pi Configuration

Reusable, versioned configuration for the Pi coding agent.

See [OpenCode-to-Pi migration plan](docs/OPENCODE_TO_PI_MIGRATION.md) for the current OpenCode inventory and an incremental migration path.

## Layout

- `extensions/` — TypeScript or JavaScript extensions. Extensions execute with the user's full privileges; keep them small, reviewed, and dependency-minimal.
- `skills/` — Reusable instruction sets. Each skill should live in its own directory with a `SKILL.md` file.
- `prompts/` — Reusable prompt templates.
- `themes/` — Optional Pi themes.

Global defaults, credentials, sessions, and trust decisions do not belong here. They are managed locally under `~/.pi/agent/`; only declarative global settings are managed by dotfiles.

## Use

Tag reviewed releases and reference a pinned tag from Pi settings:

```json
{
  "packages": ["git:github.com/<owner>/pi-config@v0.1.0"]
}
```

Use a local path only for development:

```bash
pi install /absolute/path/to/pi-config
```

## Security

Do not commit credentials, tokens, session transcripts, or generated dependency directories. Review all extensions and third-party package dependencies before installation.
