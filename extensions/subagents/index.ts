import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { formatIdCall, formatSubagentRunCall } from "../../src/tool-rendering/call-labels.ts";
import { createToolResultPreview, getToolResultText } from "../../src/tool-rendering/result-preview.ts";
import { countRunningRuns, resolveModelSelection, shouldInjectCompletion, shouldRestoreRun, shouldWatchCompletion, summarizeWorkerEvent } from "../../src/subagents/state.ts";

/** The default maximum wait for a blocking worker. */
const DEFAULT_TIMEOUT_SECONDS = 300;

/** Lists tools a child worker may receive from its parent. */
const ALLOWED_SUBAGENT_TOOLS = new Set(["read", "bash", "edit", "write", "fd", "rg"]);

/** Describes the requested worker execution mode. */
const ModeSchema = Type.Unsafe<"blocking" | "background">({ type: "string", enum: ["blocking", "background"] });

/** Describes the requested timeout action. */
const TimeoutActionSchema = Type.Unsafe<"terminate" | "keep_running">({ type: "string", enum: ["terminate", "keep_running"] });

/** Validates launch arguments for a bounded subagent worker. */
const RunSchema = Type.Object({
  task: Type.String({ description: "One concrete delegated objective with expected output and constraints." }),
  mode: Type.Optional(ModeSchema),
  timeoutSeconds: Type.Optional(Type.Integer({ minimum: 30, maximum: 3600 })),
  onTimeout: Type.Optional(TimeoutActionSchema),
  tools: Type.Optional(Type.Array(Type.String({ description: "Allowed child tool: read, bash, edit, write, fd, or rg." }), { minItems: 1, maxItems: 8, description: "Optional child allowlist; defaults to read. Subagent and background-job tools are prohibited." })),
  model: Type.Optional(Type.String({ description: "Model for the child worker: 'provider/model-id' or a bare model id. Defaults to the main session's active model." })),
  provider: Type.Optional(Type.String({ description: "Provider for the child worker when the model id alone is ambiguous." })),
  cwd: Type.Optional(Type.String()),
});

/** Validates a run identifier used by status and cancellation tools. */
const RunIdSchema = Type.Object({ runId: Type.String() });

/** Represents validated launch parameters. */
type RunParameters = Static<typeof RunSchema>;

/** Stores the durable artifacts and ownership of one worker. */
type Run = { id: string; tmux: string; dir: string; sessionId: string; started: number; tools: string[]; status: string; notifyOnCompletion?: boolean; model?: string };

/** Narrows a persisted custom session entry to a subagent run record. */
function isRun(value: unknown): value is Run {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Run>;
  return typeof record.id === "string" && typeof record.tmux === "string" && typeof record.dir === "string" && typeof record.sessionId === "string";
}

/** Quotes a value for the POSIX shell used by tmux. */
function shellQuote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }

/** Returns a short worker result without exposing intermediate event content. */
async function finalReport(run: Run): Promise<string> {
  const events = await readFile(join(run.dir, "events.jsonl"), "utf8").catch(() => "");
  const lines = events.trim().split("\n").reverse();
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as { type?: string; message?: { role?: string; content?: Array<{ type?: string; text?: string }> } };
      if (event.type === "message_end" && event.message?.role === "assistant") {
        return event.message.content?.find((part) => part.type === "text")?.text ?? "(no final report)";
      }
    } catch { /* Ignore incomplete JSON lines. */ }
  }
  return "(no final report)";
}

/** Tests whether the tmux worker session is still alive. */
async function isRunning(pi: ExtensionAPI, run: Run): Promise<boolean> {
  const result = await pi.exec("tmux", ["has-session", "-t", run.tmux], { timeout: 5_000 });
  return result.code === 0;
}

/** Starts a child Pi process in tmux and returns its tracked execution record. */
async function startRun(pi: ExtensionAPI, parameters: RunParameters, sessionId: string, cwd: string, modelSelection: { provider: string; modelId: string }): Promise<Run> {
  const id = `subagent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = await mkdtemp(join(tmpdir(), "pi-subagent-"));
  const tools = parameters.tools ?? ["read"];
  const unknownTools = tools.filter((tool) => !ALLOWED_SUBAGENT_TOOLS.has(tool));
  if (unknownTools.length > 0) throw new Error(`Unknown subagent tools: ${unknownTools.join(", ")}.`);
  if (tools.some((tool) => tool.startsWith("subagent_"))) throw new Error("Subagent tools cannot invoke subagent tools.");
  const prompt = `You are a delegated subagent in a fresh Pi session.\n\nObjective:\n${parameters.task}\n\nConstraints:\n- You are a subagent. Do not invoke, start, or delegate work to another subagent or background job.\n- Use only the allowed tools.\n- Do not commit, push, deploy, access credentials, or perform external side effects without explicit user approval.\n- Return a concise final report with findings, changed files, and verification.\n`;
  const promptPath = join(dir, "prompt.md");
  const scriptPath = join(dir, "run.sh");
  await writeFile(promptPath, prompt, { mode: 0o600 });
  const command = ["pi", "--mode", "json", "--print", "--no-session", "--tools", tools.join(","), "--provider", modelSelection.provider, "--model", modelSelection.modelId, `@${promptPath}`].map(shellQuote).join(" ");
  await writeFile(scriptPath, `#!/bin/sh\n${command} >${shellQuote(join(dir, "events.jsonl"))} 2>${shellQuote(join(dir, "stderr.log"))}\nprintf '%s' $? >${shellQuote(join(dir, "exit-code"))}\n`, { mode: 0o700 });
  const run = { id, tmux: id, dir, sessionId, started: Date.now(), tools, status: "running", notifyOnCompletion: parameters.mode === "background", model: `${modelSelection.provider}/${modelSelection.modelId}` };
  const created = await pi.exec("tmux", ["new-session", "-d", "-s", run.tmux, "-c", parameters.cwd ?? cwd, "/bin/sh", scriptPath], { timeout: 5_000 });
  if (created.code !== 0) throw new Error(`Failed to start tmux worker: ${created.stderr.trim()}`);
  return run;
}

/** Registers isolated tmux workers and their lifecycle tools. */
export default function subagents(pi: ExtensionAPI): void {
  const runs = new Map<string, Run>();
  let sessionClosing = false;
  let sessionGeneration = 0;
  const refreshStatus = async (run: Run): Promise<boolean> => {
    const running = await isRunning(pi, run);
    if (running) { run.status = "running"; return true; }
    const exitCode = await readFile(join(run.dir, "exit-code"), "utf8").catch(() => "");
    run.status = exitCode.trim() === "0" ? "completed" : "failed";
    return false;
  };
  const updateStatus = (ctx: { ui: { setStatus(key: string, value: string | undefined): void } }): void => {
    const running = countRunningRuns([...runs.values()].map((run) => run.status));
    ctx.ui.setStatus("subagents", running > 0 ? `${running} subagent${running === 1 ? "" : "s"} running` : undefined);
  };
  const watchRun = async (run: Run, ctx: ExtensionContext, generation = sessionGeneration): Promise<void> => {
    while (generation === sessionGeneration && !sessionClosing) {
      try { if (!await refreshStatus(run)) break; } catch { return; }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (generation !== sessionGeneration || sessionClosing) return;
    updateStatus(ctx);
    if (!sessionClosing && shouldInjectCompletion(run.sessionId, ctx.sessionManager.getSessionId())) {
      const outcome = run.status === "completed" ? "completed" : "failed";
      pi.sendMessage({ customType: "subagent_completion", content: `Subagent ${run.id} ${outcome}:\n${await finalReport(run)}`, display: true }, { deliverAs: "nextTurn" });
      pi.appendEntry("subagent_completion", { runId: run.id });
    }
  };
  pi.registerTool({ name: "subagent_run", label: "Run Subagent", description: "Run one bounded Pi subagent in tmux. Blocking is the default and returns only its final report. Optionally select the child model via model ('provider/model-id' or bare id) and provider; defaults to the main session's active model.", promptSnippet: "Delegate a bounded task to an isolated Pi subagent.", promptGuidelines: ["Use subagent_run only for a concrete bounded task; default to read-only tools and do not delegate commits, deployments, or credential access.", "Pick the child model to fit the task: use a cheap model for straightforward exploration or search, and the default (main session) model only when the task needs it."], parameters: RunSchema,
    renderCall(parameters, theme) {
      return new Text(theme.fg("toolTitle", theme.bold(formatSubagentRunCall(parameters))), 0, 0);
    },
    renderResult(result, options, theme) {
      return createToolResultPreview(getToolResultText(result.content), options.expanded, "head", theme);
    },
    async execute(_id, parameters, signal, _update, ctx) {
      const modelSelection = resolveModelSelection(parameters, ctx.model);
      const registered = ctx.modelRegistry.find(modelSelection.provider, modelSelection.modelId);
      if (!registered) throw new Error(`Unknown model ${modelSelection.provider}/${modelSelection.modelId}. Use a 'provider/model-id' pair from the available catalogue.`);
      const run = await startRun(pi, parameters, ctx.sessionManager.getSessionId(), ctx.cwd, modelSelection); runs.set(run.id, run); pi.appendEntry("subagent_run", run); updateStatus(ctx);
      if (shouldWatchCompletion(parameters.mode ?? "blocking", false)) {
        void watchRun(run, ctx);
        return { content: [{ type: "text", text: `Started background subagent ${run.id}. Inspect with subagent_status; tmux attach -t ${run.tmux}` }], details: run };
      }
      const deadline = Date.now() + (parameters.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
      while (await refreshStatus(run)) {
        if (signal?.aborted || Date.now() >= deadline) {
          if ((parameters.onTimeout ?? "terminate") === "terminate") await pi.exec("tmux", ["kill-session", "-t", run.tmux], { timeout: 5_000 });
          run.status = "timed_out"; updateStatus(ctx);
          if ((parameters.onTimeout ?? "terminate") === "keep_running") {
            run.notifyOnCompletion = true;
            pi.appendEntry("subagent_run", run);
            void watchRun(run, ctx);
          }
          return { content: [{ type: "text", text: `Subagent ${run.id} timed out (${parameters.onTimeout ?? "terminate"}).` }], details: run };
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      updateStatus(ctx);
      if (run.status === "failed") throw new Error(`Subagent ${run.id} failed: ${await finalReport(run)}`);
      return { content: [{ type: "text", text: await finalReport(run) }], details: run };
    } });
  pi.registerTool({ name: "subagent_status", label: "Subagent Status", description: "Check a tmux subagent without adding its intermediate output to context.", parameters: RunIdSchema,
    renderCall(parameters, theme) { return new Text(theme.fg("toolTitle", theme.bold(formatIdCall("subagent_status", parameters.runId))), 0, 0); },
    async execute(_id, parameters, _signal, _update, ctx) { const run = runs.get(parameters.runId); if (!run) throw new Error("Unknown subagent run."); const running = await refreshStatus(run); updateStatus(ctx); const events = await readFile(join(run.dir, "events.jsonl"), "utf8").catch(() => ""); const last = events.trim().split("\n").reverse().map((line) => { try { return summarizeWorkerEvent(JSON.parse(line)); } catch { return undefined; } }).find(Boolean); const elapsed = Math.floor((Date.now() - run.started) / 1000); return { content: [{ type: "text", text: `${run.id}: ${running ? "running" : run.status}${last ? ` (${last})` : ""}; ${elapsed}s elapsed\nartifacts: ${run.dir}\ntmux attach -t ${run.tmux}` }], details: run }; } });
  pi.registerTool({ name: "subagent_cancel", label: "Cancel Subagent", description: "Terminate a running tmux subagent.", parameters: RunIdSchema,
    renderCall(parameters, theme) { return new Text(theme.fg("toolTitle", theme.bold(formatIdCall("subagent_cancel", parameters.runId))), 0, 0); },
    async execute(_id, parameters, _signal, _update, ctx) { const run = runs.get(parameters.runId); if (!run) throw new Error("Unknown subagent run."); await pi.exec("tmux", ["kill-session", "-t", run.tmux], { timeout: 5_000 }); run.status = "cancelled"; ctx.ui.setStatus("subagents", undefined); return { content: [{ type: "text", text: `Cancelled ${run.id}` }], details: run }; } });
  pi.on("session_start", async (_event, ctx) => {
    sessionClosing = false;
    sessionGeneration += 1;
    const entries = ctx.sessionManager.getEntries() as Array<{ type?: string; customType?: string; data?: unknown }>;
    const delivered = new Set(entries.filter((entry) => entry.type === "custom" && entry.customType === "subagent_completion").map((entry) => (entry.data as { runId?: string } | undefined)?.runId).filter((runId): runId is string => typeof runId === "string"));
    for (const entry of entries) {
      if (entry.type !== "custom" || entry.customType !== "subagent_run" || !isRun(entry.data)) continue;
      const run = entry.data;
      if (!shouldRestoreRun(run.sessionId, ctx.sessionManager.getSessionId(), run.notifyOnCompletion === true) || delivered.has(run.id)) continue;
      runs.set(run.id, run);
      if (await refreshStatus(run)) continue;
      const outcome = run.status === "completed" ? "completed" : "failed";
      pi.sendMessage({ customType: "subagent_completion", content: `Subagent ${run.id} ${outcome}:\n${await finalReport(run)}`, display: true }, { deliverAs: "nextTurn" });
      pi.appendEntry("subagent_completion", { runId: run.id });
    }
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    sessionClosing = true;
    sessionGeneration += 1;
    const active = [...runs.values()].filter((run) => run.status === "running"); if (active.length > 0) ctx.ui.notify(`${active.length} subagent worker remains running in tmux.`, "warning"); });
}
