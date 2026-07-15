---
name: codebase-memory
description: Explore an indexed codebase with the local codebase-memory-mcp CLI. Use for architecture discovery, structural search, call/data-flow tracing, impact analysis, or targeted indexed snippets.
---

# Codebase Memory

Use the local `codebase-memory-mcp cli` interface only. Do not start its MCP server or add MCP configuration.

## Safety and scope

- Treat the CLI as read-only unless the user explicitly confirms indexing.
- Never run `codebase-memory-mcp install`, `uninstall`, or `update`. These commands can modify detected agent configurations. CBM updates are managed through dotfiles.
- Never run `codebase-memory-mcp config set`, `config reset`, `delete_project`, `manage_adr`, or `ingest_traces` unless the user explicitly requests that exact operation.
- Do not enable `--ui`, do not set `persistence`, and do not create or commit `.codebase-memory/` artifacts unless explicitly requested.
- `index_repository` writes a local index under `~/.cache/codebase-memory-mcp/`; ask for confirmation before running it. Use `moderate` mode by default. Use `full` only when semantic/similarity edges are necessary.
- Prefer CLI flags. Passing raw JSON arguments is deprecated. Add `--json` when structured output is useful.

## Select the project

CBM queries use its indexed project name, which may differ from the directory name. List projects first when the name is unknown:

```bash
codebase-memory-mcp cli list_projects --json
codebase-memory-mcp cli index_status --project "<project-name>" --json
```

If the current repository is not indexed, explain that indexing is needed and ask before running:

```bash
codebase-memory-mcp cli index_repository --repo-path "$PWD" --mode moderate --json
```

## Exploration workflow

1. Start with a compact architecture view:

   ```bash
   codebase-memory-mcp cli get_architecture --project "<project-name>" --aspects '["overview"]' --json
   ```

2. Search before tracing or reading snippets:

   ```bash
   codebase-memory-mcp cli search_graph --project "<project-name>" --query "<keywords>" --limit 20 --json
   ```

   Use structural filters when the target is known:

   ```bash
   codebase-memory-mcp cli search_graph --project "<project-name>" --label Function --name-pattern ".*Handler.*" --limit 20 --json
   ```

3. Trace the selected function's relationships:

   ```bash
   codebase-memory-mcp cli trace_path --project "<project-name>" --function-name "<function>" --direction inbound --depth 3 --risk-labels true --json
   ```

   Use `--mode data_flow` only for data-flow questions and `--mode cross_service` only for explicitly cross-service tracing.

4. Retrieve a narrow source snippet only after identifying its qualified name:

   ```bash
   codebase-memory-mcp cli get_code_snippet --project "<project-name>" --qualified-name "<qualified-name>" --include-neighbors true --json
   ```

5. Use the indexed code search when structural search is insufficient:

   ```bash
   codebase-memory-mcp cli search_code --project "<project-name>" --pattern "<pattern>" --mode compact --context 2 --limit 20 --json
   ```

6. Before changing shared code, inspect the current diff impact:

   ```bash
   codebase-memory-mcp cli detect_changes --project "<project-name>" --scope unstaged --depth 3 --json
   ```

## Results

- Treat CBM output as an index-derived guide; verify important conclusions against the source files and relevant tests.
- Report the indexed project name, relevant paths/symbols, and any uncertainty caused by a stale or incomplete index.
- Do not use CBM as a replacement for reading the complete file before editing it.
