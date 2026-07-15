# OpenCode to Pi Migration Plan

This document inventories the current OpenCode implementation in the dotfiles repository and defines an incremental, safety-first path to Pi. It is a planning document; it does not enable Pi resources or remove OpenCode.

## Decision

Keep Pi configuration in the standalone Pi package repository loaded in main config json in dotfiles, alongside other packages:
{
  "packages": [
    "git:gitlab.mmz.sh/mmz-personal/pi-config@v0.1.0"
  ]
}

Run Pi and OpenCode in parallel. Do not remove OpenCode or its autonomous workflow until Pi has proven equivalents for the required safety and verification controls.

## Current OpenCode implementation

### Installation and shell integration

| Component | Current implementation | Migration status |
|---|---|---|
| OpenCode binary | Documented in `SETUP.md` as curl-installed to `~/.opencode/bin` | Keep while Pi is evaluated |
| PATH | `dot_bashrc` adds `~/.opencode/bin` | Keep |
| Shell alias | `o='opencode'` in `dot_bash_aliases` | Keep; Pi uses `p='pi'` |
| Claude Code integration | `OPENCODE_DISABLE_CLAUDE_CODE=1` | OpenCode-only; do not copy |
| Supporting tools | mise manages Beads, Dolt, td, mcporter, aidex-mcp, ctx7, Firecrawl, tokscale, kimaki, openportal, and agent-browser | Retain individually where Pi skills need them |

OpenCode installation is documented but no chezmoi hook currently installs its binary. This is existing configuration drift and is not part of the Pi migration.

### Main configuration

`dot_config/opencode/opencode.jsonc`:

- Enables `cc-safety-net`.
- Registers CBM, AiDex, and Serena as MCP servers.
- Disables OpenCode's stock `plan` and `general` agents.
- Denies all `aidex_*`, `cbm_*`, and `serena_*` tools globally.

OpenCode documents `@tarquinen/opencode-dcp`, but it is not currently registered. A local `plugins/read-limit.ts` also exists but is not registered. Neither should be treated as an active dependency during migration.

### Agent roles

| OpenCode role | Current purpose | Pi path |
|---|---|---|
| `build` | Primary coding agent; TDD; Serena access | Global/project `AGENTS.md` plus skills for TDD, verification, and review gates |
| `explore` | Read-only codebase exploration via AiDex and CBM | Separate read-only Pi session or a future reviewed extension; no native subagent equivalence |
| `code-reviewer` | Fresh-context read-only review | Fresh Pi session with `/review [focus]`; preserve read-only behavior by instruction initially |
| `ask` | Read-only Q&A | Pi session launched with a read-only prompt/skill |
| `assistant` | General-purpose agent; confirms before mutation | Global Pi instructions and explicit confirmation policy |
| `devops` | Infrastructure agent with execution tiers | A dedicated Pi skill/instructions file; preserve explicit Tier 1/2/3 confirmation rules |

Pi deliberately does not provide OpenCode-style subagents or plan mode by default. Do not claim role parity until a tested workflow exists.

### Commands and workflow

| OpenCode command | Current behavior | Pi migration target |
|---|---|---|
| `/brainstorm` | Produces `.agents/PRD.md` through dialogue | Implemented as a resumable Pi prompt for owned applications |
| `/prepare-rules` | Derives `.agents/RULES.md`; verifies docs/versions | Implemented as a resumable Pi prompt using Context7 where needed |
| `/survey-codebase` | Builds rules for existing projects | Implemented as a resumable Pi prompt that surveys directly in Pi |
| `/prepare-backlog` | Manages Beads/td tasks from PRD | Defer; depends on deciding whether Pi will retain Beads/td |
| `/plan` | Creates `.agents/PLAN.md` and syncs td | Implemented as a Pi prompt; no native Pi plan mode required |
| `/dev` | Enforces TDD, verify, review, commit, handoff | Implemented as a prompt orchestrating independent Pi skills; validate the sequence in use |
| `/quickfix` | Smaller TDD/review/commit workflow | Retained as a compatibility prompt for the lightweight `/build` workflow |
| `/ralph-loop` | Unattended plan/execute/recovery loop | Keep on OpenCode initially; migrate last |

### Skills

| OpenCode skill | Pi target | Priority |
|---|---|---|
| `write-tests` | Implemented: `skills/write-tests/SKILL.md` | High |
| `verify` | Implemented: `skills/verify/SKILL.md` | High |
| `debugging` | Implemented: `skills/debugging/SKILL.md` | High |
| `request-review` | Implemented: `skills/request-review/SKILL.md` | High |
| `commit` | Implemented: `skills/commit/SKILL.md` | High |
| `session-wrapup` | Implemented: `skills/session-wrapup/SKILL.md` | Medium |
| `find-docs` | `skills/find-docs/SKILL.md` using `ctx7` | Medium |
| `firecrawl` | Implemented: `skills/firecrawl/SKILL.md` using `firecrawl` | Medium |

Port instructions first, not code. Each skill must be reviewed against Pi's actual tool model before it is enabled.

### MCP and code navigation

| Component | Current state | Pi migration decision |
|---|---|---|
| Serena | OpenCode MCP server with restricted `opencode` context | Evaluate Pi integration separately; retain the existing Serena context only if Pi's integration model supports it |
| AiDex | OpenCode MCP server, limited to `explore` | Do not migrate until Pi-side access control is understood |
| CBM | OpenCode MCP server, limited to `explore` | Do not migrate until Pi-side access control is understood |
| `cc-safety-net` | Active OpenCode plugin for destructive-command interception | Preserve safety through explicit Pi instructions and evaluate a Pi extension only after review |

Global denial plus role-specific MCP allowlists is an important current control. Do not replace it with broad unrestricted tool access.

### Autonomous workflow and state

The `ralph` script invokes `opencode run --agent ... --command ralph-loop` and manages `.agents/RALPH.md`, `.agents/HANDOFF.md`, and history. It requires Git, OpenCode, Beads, and a sufficient task backlog.

Pi should not run this workflow until all of the following are proven:

1. Plan, verify, review, and handoff steps are deterministic enough for unattended use.
2. Project trust is explicitly controlled.
3. Destructive shell and Git operations are protected.
4. Task/backlog state has a clear owner.
5. Failures are surfaced without falsely reporting completion.

## Target Pi package layout

```text
pi-config/
├── extensions/
├── skills/
│   ├── application-development/
│   ├── infrastructure-operations/
│   ├── write-tests/
│   ├── verify/
│   ├── debugging/
│   ├── request-review/
│   ├── commit/
│   ├── session-wrapup/
│   └── firecrawl/
├── prompts/
│   ├── brainstorm.md
│   ├── prepare-rules.md
│   ├── survey-codebase.md
│   ├── build.md
│   ├── devops.md
│   ├── plan.md
│   ├── dev.md
│   ├── quickfix.md
│   └── review.md
├── themes/
└── package.json
```

The dotfiles-managed `~/.pi/agent/settings.json` remains machine-wide declarative configuration. When this package is enabled, reference it at a pinned Git tag or commit alongside pinned third-party packages such as `npm:pi-effort@0.0.5`. It is not loaded by dotfiles yet. Do not manage credentials, trust decisions, sessions, or installed package directories with chezmoi.

## Migration phases

### Phase 0: Baseline

- Keep OpenCode unchanged.
- Keep Pi credentials in `~/.pi/agent/auth.json`, outside dotfiles.
- Set `defaultProjectTrust` to `ask` when Pi global settings are next updated.
- Use Pi only on low-risk repositories.

### Phase 1: Safe core workflow

Implemented, pending real-project validation:

- `application-development` is the canonical policy for `/build`, `/plan`, `/dev`, and `/quickfix`; it replaces duplicated OpenCode build-agent instructions without recreating an agent role.
- `infrastructure-operations` is the canonical safety-first policy for `/devops` and future infrastructure workflows.
- `write-tests`, `verify`, `debugging`, `request-review`, `commit`, and `session-wrapup` are available as Pi skills.

Acceptance criteria remain: Pi writes a failing test before implementation, runs declared project checks, identifies introduced failures, asks before committing, and never stages secrets or unrelated files.

### Phase 1a: Role-to-command transition

The OpenCode `build` and `devops` agents are replaced by prompt templates, not Pi agents:

- `/build [task]` applies the application implementation workflow in the current session.
- `/devops [task]` applies the infrastructure and support workflow, including explicit execution tiers.

Prompt templates provide instructions only. They do not create a separate session, change Pi tool availability, or grant permission for state-changing actions.

The build-aware workflow templates are:

- `/build [task]` is the lightweight path for one small, well-understood change. It uses proportionate tests and verification, but does not create a plan, td task, review session, handoff, or commit by default.
- `/plan [scope]` loads `application-development`, initializes td when needed, synchronizes its backlog, and writes an implementation-focused `.agents/PLAN.md`.
- `/dev [instructions]` requires the approved td-backed plan, then executes it with a test-first loop, verification, skill-driven review, optional commit, and handoff.
- `/quickfix [task]` is retained as a compatibility prompt for `/build`.

### Phase 2: Planning and documentation

Implemented: `/brainstorm`, `/prepare-rules`, `/survey-codebase`, and `/plan` are prompts. Brainstorm creates PRDs only for owned applications; codebase survey creates RULES for existing repositories and forks without inventing a PRD. All three planning documents use their open-question sections as resumable state.

Remaining: decide whether `find-docs` needs a dedicated skill; its small Context7 procedure is already embedded in the relevant prompts. Existing repository `AGENTS.md` files remain the primary project-specific instruction source because Pi loads them automatically.

### Phase 3: Read-only exploration and review

`/review [focus]` remains available for a manually launched fresh session. It is a procedural read-only control: prompt templates cannot enforce tool permissions.

For implementation workflow reviews, `request-review` now specifies a tmux-backed fresh Pi process with an immutable Git snapshot and `--tools read,grep,find,ls`. It uses `--print --no-session`, so the reviewer exits after writing its report and does not persist a session. This is an instruction-only worker, not a native Pi subagent or an extension; validate it on low-risk repositories before relying on it.

Define repeatable separate-session procedures for exploration. Do not add MCP servers until their Pi integration and permission model have been reviewed.

### Phase 4: Validate the tmux review worker

Validate the implemented worker against all of these requirements:

1. Use a unique tmux session name and never kill a pre-existing session.
2. Launch only after implementation has stopped changing the workspace.
3. Snapshot Git status, staged and unstaged diffs, and untracked-file metadata into a unique temporary directory.
4. Run the reviewer with `--tools read,grep,find,ls`; do not grant `bash`.
5. Supply the immutable snapshot and embedded read-only reviewer policy as the review context.
6. Apply a bounded timeout and capture report and error output separately.
7. Clean up only resources created by that run.
8. Return the reviewer report to the initiating session without granting the reviewer a mutation path.

### Phase 5: Evaluate advanced automation

`td` is a required dependency of the `/plan` → `/dev` workflow and is initialized by `/plan` for a new repository. Decide separately whether the autonomous `ralph` loop remains OpenCode-specific or receives a separately designed Pi implementation.

## Naming and collision policy

Use simple, descriptive names that express the resource's purpose:

- `verify`
- `commit`
- `plan`
- `safety`

Pi package dependencies are isolated, but loaded extensions, skills, prompts, and themes share one session. Names must remain unique across enabled packages, and extensions must not register overlapping hooks without an explicit design decision. Pin all third-party packages and review any extension before installation.

## Out of scope

- Copying API keys, authentication files, sessions, or trust decisions.
- Automatically enabling unreviewed third-party extensions.
- Replacing OpenCode autonomous workflows before the cutover criteria are met.
- Removing OpenCode configuration.
