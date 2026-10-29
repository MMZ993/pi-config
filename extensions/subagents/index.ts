import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { formatIdCall, formatSubagentRunCall } from "../../src/tool-rendering/call-labels.ts";
import { createToolResultPreview, getToolResultText } from "../../src/tool-rendering/result-preview.ts";
import { buildWorkerPiArgs, countRunningRuns, resolveModelSelection, shouldInjectCompletion, shouldWatchCompletion, summarizeWorkerEvent, THINKING_LEVELS, type ThinkingLevel } from "../../src/subagents/state.ts";

/** The default maximum wait for a blocking worker. */
const DEFAULT_TIMEOUT_SECONDS = 300;

/** Bounds unacknowledged tmux launches independently of the worker's execution timeout policy. */
const LAUNCH_TIMEOUT_MS = 30_000;

/** Lists tools a child worker may receive from its parent. */
const ALLOWED_SUBAGENT_TOOLS = new Set(["read", "bash", "edit", "write", "fd", "rg"]);

/** Describes the requested worker execution mode. */
const ModeSchema = Type.Unsafe<"blocking" | "background">({ type: "string", enum: ["blocking", "background"] });

/** Describes the requested timeout action. */
const TimeoutActionSchema = Type.Unsafe<"terminate" | "keep_running">({ type: "string", enum: ["terminate", "keep_running"] });

/** Describes native Pi thinking/reasoning effort choices. */
const ThinkingLevelSchema = Type.Unsafe<ThinkingLevel>({
  type: "string",
  enum: [...THINKING_LEVELS],
  description: "Optional child Pi thinking level: off, minimal, low, medium, high, xhigh, or max.",
});

/** Validates launch arguments for a bounded subagent worker. */
const RunSchema = Type.Object({
  task: Type.String({ description: "One concrete delegated objective with expected output and constraints." }),
  mode: Type.Optional(ModeSchema),
  timeoutSeconds: Type.Optional(Type.Integer({ minimum: 30, maximum: 3600 })),
  onTimeout: Type.Optional(TimeoutActionSchema),
  tools: Type.Optional(Type.Array(Type.String({ description: "Allowed child tool: read, bash, edit, write, fd, or rg." }), { minItems: 1, maxItems: 8, description: "Optional child allowlist; defaults to read. Subagent and background-job tools are prohibited." })),
  model: Type.Optional(Type.String({ description: "Model for the child worker: 'provider/model-id' or a bare model id. Defaults to the main session's active model." })),
  provider: Type.Optional(Type.String({ description: "Provider for the child worker when the model id alone is ambiguous." })),
  thinkingLevel: Type.Optional(ThinkingLevelSchema),
  cwd: Type.Optional(Type.String()),
});

/** Validates a run identifier used by status and cancellation tools. */
const RunIdSchema = Type.Object({ runId: Type.String() });

/** Represents validated launch parameters. */
type RunParameters = Static<typeof RunSchema>;

/** Stores the durable artifacts and ownership of one worker. */
type Run = { id: string; tmux: string; dir: string; sessionId: string; started: number; tools: string[]; status: string; notifyOnCompletion?: boolean; model?: string; cwd?: string; reasoning?: ThinkingLevel; deadline?: number; launchDeadline?: number; onTimeout?: "terminate" | "keep_running"; terminationIntent?: "cancelled" | "timed_out"; completionSuppressed?: boolean };

/** Narrows a persisted custom session entry to a subagent run record. */
function isRun(value: unknown): value is Run {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Run>;
  return typeof record.id === "string" && typeof record.tmux === "string" && typeof record.dir === "string" && typeof record.sessionId === "string";
}

/** Identifies terminal states that asynchronous refreshes must never overwrite. */
function isTerminalStatus(status: string): boolean {
  return ["completed", "failed", "cancelled", "timed_out"].includes(status);
}

/** Maps a complete wrapper exit-code artifact to its natural terminal state. */
function naturalExitStatus(exitCode: string): "completed" | "failed" | undefined {
  const value = exitCode.trim();
  if (!/^\d+$/.test(value) || Number(value) > 255) return undefined;
  return Number(value) === 0 ? "completed" : "failed";
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
  if (result.killed) throw new Error(`tmux status probe for ${run.id} timed out or was killed.`);
  return result.code === 0;
}

/** Persists preparation before spawning tmux; writes a durable launch outcome even if session ownership changes. */
async function startRun(pi: ExtensionAPI, parameters: RunParameters, sessionId: string, cwd: string, modelSelection: { provider: string; modelId: string }, onPrepared: (run: Run) => void, stillOwned: () => boolean): Promise<Run> {
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
  const command = ["pi", ...buildWorkerPiArgs({
    tools,
    provider: modelSelection.provider,
    modelId: modelSelection.modelId,
    promptPath,
    thinkingLevel: parameters.thinkingLevel,
  })].map(shellQuote).join(" ");
  const started = Date.now();
  const launchDeadline = started + LAUNCH_TIMEOUT_MS;
  // mkdir is an atomic admission decision shared with cancellation. Never remove this directory:
  // a delayed tmux request must not launch Pi after abandonment, even across process restarts.
  await writeFile(scriptPath, `#!/bin/sh\nmkdir ${shellQuote(join(dir, "launch-claim"))} 2>/dev/null || exit 0\n[ "$(date +%s)" -lt ${Math.floor(launchDeadline / 1_000)} ] || exit 0\nprintf '%s' started >${shellQuote(join(dir, "launch-state"))}\n${command} >${shellQuote(join(dir, "events.jsonl"))} 2>${shellQuote(join(dir, "stderr.log"))}\nprintf '%s' $? >${shellQuote(join(dir, "exit-code"))}\n`, { mode: 0o700 });
  const run: Run = { id, tmux: id, dir, sessionId, started, tools, status: "launching", notifyOnCompletion: parameters.mode === "background", model: `${modelSelection.provider}/${modelSelection.modelId}`, cwd: parameters.cwd ?? cwd, reasoning: parameters.thinkingLevel, deadline: started + (parameters.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1_000, launchDeadline, onTimeout: parameters.onTimeout ?? "terminate" };
  if (!stillOwned()) throw new Error("Subagent launch continuation was abandoned after session shutdown or reload.");
  onPrepared(run);
  const created = await pi.exec("tmux", ["new-session", "-d", "-s", run.tmux, "-c", parameters.cwd ?? cwd, "/bin/sh", scriptPath], { timeout: 5_000 });
  // Artifacts belong to the worker, not the current Pi lifecycle. A killed exec is inconclusive.
  if (!created.killed) await writeFile(join(dir, "launch-state"), created.code === 0 ? "started" : "failed", { mode: 0o600 });
  if (created.code !== 0 || created.killed) throw new Error(`Failed to start tmux worker: ${created.stderr.trim() || "launch timed out or was killed"}`);
  if (!stillOwned()) throw new Error("Subagent launch continuation was abandoned after session shutdown or reload.");
  if (["cancelled", "timed_out"].includes(run.status) || run.terminationIntent) throw new Error("Subagent launch was cancelled or expired.");
  if (run.status === "launching" && Date.now() >= launchDeadline) throw new Error("Subagent launch deadline expired; monitoring will reconcile it.");
  if (run.status === "launching") run.status = "running";
  return run;
}

/** Registers isolated tmux workers and their lifecycle tools. */
export default function subagents(pi: ExtensionAPI): void {
  const runs = new Map<string, Run>();
  const terminatingRuns = new Map<Run, Promise<void>>();
  const watchedRuns = new Set<Run>();
  let sessionClosing = false;
  let sessionGeneration = 0;
  /** Rejects stale continuations before they mutate state or append to the current session. */
  const requireOwnership = (run: Run, ctx: ExtensionContext, generation: number): void => {
    if (!ownsRun(run, ctx, generation)) throw new Error("Subagent continuation abandoned after session ownership changed.");
  };
  /** Refreshes an owned run, revalidating generation and terminal transitions after every I/O await. */
  const refreshStatus = async (run: Run, ctx: ExtensionContext, generation: number): Promise<boolean> => {
    requireOwnership(run, ctx, generation);
    if (isTerminalStatus(run.status)) return false;
    // Read launch acknowledgement before probing: acknowledgement arriving after a missing-session
    // probe must not let that stale probe fail a worker which has only just appeared.
    const launching = run.status === "launching";
    const launchState = launching ? await readFile(join(run.dir, "launch-state"), "utf8").catch(() => "") : undefined;
    requireOwnership(run, ctx, generation);
    if (isTerminalStatus(run.status)) return false;
    const running = await isRunning(pi, run);
    requireOwnership(run, ctx, generation);
    if (isTerminalStatus(run.status)) return false;
    if (terminatingRuns.has(run)) return true;
    if (running) {
      const launched = run.status === "launching";
      run.status = "running";
      if (launched) pi.appendEntry("subagent_run", { ...run });
      return true;
    }
    if (launching && run.status !== "launching") return true;
    const intent = run.terminationIntent;
    const exitCode = await readFile(join(run.dir, "exit-code"), "utf8").catch(() => "");
    requireOwnership(run, ctx, generation);
    if (isTerminalStatus(run.status)) return false;
    if (terminatingRuns.has(run) || run.terminationIntent !== intent) return true;
    if (launching && run.status !== "launching") return true;
    const natural = naturalExitStatus(exitCode);
    // Reconcile an acknowledged/live launch before enforcing its deadline. A timed-out launch
    // without process or durable outcome remains bounded, independent of keep_running policy.
    if (launching && !natural && launchState !== "started" && launchState !== "failed") {
      if (run.launchDeadline !== undefined && (run.terminationIntent || Date.now() >= run.launchDeadline)) {
        await terminateRun(run, run.terminationIntent ?? "timed_out", ctx, generation);
        requireOwnership(run, ctx, generation);
        return !isTerminalStatus(run.status);
      }
      return true;
    }
    run.status = natural ?? intent ?? "failed";
    run.terminationIntent = undefined;
    if (intent || launching) pi.appendEntry("subagent_run", { ...run });
    return false;
  };
  const updateStatus = (ctx: { ui: { setStatus(key: string, value: string | undefined): void } }): void => {
    const running = countRunningRuns([...runs.values()].map((run) => run.status));
    ctx.ui.setStatus("subagents", running > 0 ? `${running} subagent${running === 1 ? "" : "s"} running` : undefined);
  };
  /** Checks that asynchronous work still owns this run in the active session. */
  const ownsRun = (run: Run, ctx: ExtensionContext, generation: number): boolean => generation === sessionGeneration && !sessionClosing && runs.get(run.id) === run && shouldInjectCompletion(run.sessionId, ctx.sessionManager.getSessionId());
  /** Serializes timeout/cancel requests, checks kill failures, and commits only while still owning the session. */
  const terminateRun = async (run: Run, status: "cancelled" | "timed_out", ctx: ExtensionContext, generation = sessionGeneration): Promise<void> => {
    const pending = terminatingRuns.get(run);
    if (pending) return pending;
    if (!ownsRun(run, ctx, generation) || isTerminalStatus(run.status)) return;
    run.terminationIntent ??= status;
    if (status === "cancelled") run.completionSuppressed = true;
    pi.appendEntry("subagent_run", { ...run });
    // Older launching records have no wrapper admission fence; absence alone is not safe proof.
    if (run.status === "launching" && run.launchDeadline === undefined) { void watchRun(run, ctx, generation); return; }
    const operation = (async () => {
      if (run.launchDeadline !== undefined) {
        // Win admission before probing absence. EEXIST means the wrapper already claimed admission
        // (and must be killed if live), or an earlier cancellation already installed the fence.
        await mkdir(join(run.dir, "launch-claim")).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "EEXIST") throw error;
        });
        if (!ownsRun(run, ctx, generation) || isTerminalStatus(run.status)) return;
      }
      const running = await isRunning(pi, run);
      if (!ownsRun(run, ctx, generation) || isTerminalStatus(run.status)) return;
      let killed = false;
      let stillRunning = running;
      let failedKill = false;
      if (running) {
        const result = await pi.exec("tmux", ["kill-session", "-t", run.tmux], { timeout: 5_000 });
        if (!ownsRun(run, ctx, generation) || isTerminalStatus(run.status)) return;
        killed = result.code === 0 && !result.killed;
        if (!killed) {
          failedKill = true;
          stillRunning = await isRunning(pi, run);
          if (!ownsRun(run, ctx, generation) || isTerminalStatus(run.status)) return;
          if (stillRunning) {
            run.terminationIntent = undefined;
            pi.appendEntry("subagent_run", { ...run });
            throw new Error(`Failed to terminate ${run.id}: ${result.stderr.trim() || "tmux worker is still running"}`);
          }
        } else stillRunning = false;
      }
      const exitCode = killed ? "" : await readFile(join(run.dir, "exit-code"), "utf8").catch(() => "");
      if (!ownsRun(run, ctx, generation) || isTerminalStatus(run.status)) return;
      run.status = killed ? run.terminationIntent! : naturalExitStatus(exitCode) ?? run.terminationIntent!;
      run.terminationIntent = undefined;
      pi.appendEntry("subagent_run", { ...run });
    })();
    terminatingRuns.set(run, operation);
    try { await operation; } finally { terminatingRuns.delete(run); }
  };
  /** Reads acknowledgements only from persisted active-branch messages, never pre-result markers. */
  const deliveredCompletions = (ctx: ExtensionContext): Set<string> => {
    const delivered = new Set<string>();
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom_message" && entry.customType === "subagent_completion") {
        const details = entry.details as { runId?: string; runIds?: string[] } | undefined;
        const legacyId = typeof entry.content === "string" ? /^Subagent (\S+) (?:completed|failed|timed_out):\n/.exec(entry.content)?.[1] : undefined;
        for (const id of details?.runIds ?? [details?.runId ?? legacyId]) if (typeof id === "string") delivered.add(id);
      }
      if (entry.type !== "message" || entry.message.role !== "toolResult" || entry.message.isError) continue;
      const message = entry.message;
      const details = message.details as (Run & { completionRetrieved?: boolean }) | undefined;
      if (details && (message.toolName === "subagent_result" || message.toolName === "subagent_run") && details.completionRetrieved === true) delivered.add(details.id);
    }
    return delivered;
  };
  // Pi's nextTurn queue survives /reload and has no removal API. Select messages at the prompt boundary
  // instead; a crash before persistence simply retries. Old queued messages from earlier versions
  // cannot be removed here; restart Pi once when upgrading with a pending legacy queue.
  pi.on("before_agent_start", async (_event, ctx) => {
    const generation = sessionGeneration;
    const reports = new Map<Run, string>();
    for (const run of runs.values()) {
      if (!ownsRun(run, ctx, generation) || !run.notifyOnCompletion || deliveredCompletions(ctx).has(run.id)) continue;
      try { await refreshStatus(run, ctx, generation); } catch { continue; }
      if (!isTerminalStatus(run.status) || run.status === "cancelled") continue;
      reports.set(run, await finalReport(run));
    }
    const delivered = deliveredCompletions(ctx);
    const ready = [...reports].filter(([run]) => ownsRun(run, ctx, generation) && run.status !== "cancelled" && !run.completionSuppressed && !terminatingRuns.has(run) && !delivered.has(run.id));
    if (ready.length === 0) return;
    return { message: { customType: "subagent_completion", content: ready.map(([run, report]) => `Subagent ${run.id} ${run.status}:\n${report}`).join("\n\n"), display: true, details: { runIds: ready.map(([run]) => run.id) } } };
  });
  /** Persists a blocking worker as notification-enabled and transfers its lifecycle to the watcher. */
  const monitorAfterBlockingError = (run: Run, ctx: ExtensionContext, generation: number): void => {
    if (!ownsRun(run, ctx, generation)) return;
    run.notifyOnCompletion = true;
    pi.appendEntry("subagent_run", { ...run });
    void watchRun(run, ctx, generation);
  };
  /** Monitors each owned run once, retaining its persisted timeout policy across continuations. */
  const watchRun = async (run: Run, ctx: ExtensionContext, generation = sessionGeneration): Promise<void> => {
    if (watchedRuns.has(run) || !ownsRun(run, ctx, generation)) return;
    watchedRuns.add(run);
    try {
      const deadline = run.deadline ?? run.started + DEFAULT_TIMEOUT_SECONDS * 1_000;
      let warned = false;
      while (ownsRun(run, ctx, generation)) {
        if (run.terminationIntent && (run.status !== "launching" || run.launchDeadline !== undefined)) {
          try { await terminateRun(run, run.terminationIntent, ctx, generation); }
          catch (error) {
            if (ownsRun(run, ctx, generation) && !warned) { ctx.ui.notify(String(error), "warning"); warned = true; }
          }
          if (isTerminalStatus(run.status)) break;
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          continue;
        }
        let running: boolean;
        try { running = await refreshStatus(run, ctx, generation); } catch {
          if (!ownsRun(run, ctx, generation)) return;
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          continue;
        }
        if (!ownsRun(run, ctx, generation)) return;
        if (!running) break;
        if (run.status !== "launching" && (run.onTimeout ?? "terminate") === "terminate" && Date.now() >= deadline) {
          try { await terminateRun(run, "timed_out", ctx, generation); }
          catch (error) {
            if (ownsRun(run, ctx, generation) && !warned) { ctx.ui.notify(String(error), "warning"); warned = true; }
          }
          if (isTerminalStatus(run.status)) break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      if (!ownsRun(run, ctx, generation)) return;
      updateStatus(ctx);
    } finally {
      watchedRuns.delete(run);
    }
  };
  pi.registerTool({ name: "subagent_run", label: "Run Subagent", description: "Run one bounded Pi subagent in tmux. Blocking is the default and returns only its final report. Optionally select the child model via model ('provider/model-id' or bare id), provider, and thinkingLevel (off, minimal, low, medium, high, xhigh, max); omitted thinkingLevel uses the child's normal Pi default.", promptSnippet: "Delegate a bounded task to an isolated Pi subagent.", promptGuidelines: ["Use subagent_run only for a concrete bounded task; default to read-only tools and do not delegate commits, deployments, or credential access.", "Pick the child model to fit the task: use a cheap model for straightforward exploration or search, and the default (main session) model only when the task needs it.", "Set thinkingLevel when the delegated task needs a specific reasoning effort; it maps to the child's native `pi --thinking` option."], parameters: RunSchema,
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
      const generation = sessionGeneration;
      const sessionId = ctx.sessionManager.getSessionId();
      let prepared: Run | undefined;
      let run: Run;
      try {
        run = await startRun(pi, parameters, sessionId, ctx.cwd, modelSelection, (record) => {
          prepared = record;
          runs.set(record.id, record);
          pi.appendEntry("subagent_run", { ...record });
          updateStatus(ctx);
        }, () => generation === sessionGeneration && !sessionClosing && shouldInjectCompletion(sessionId, ctx.sessionManager.getSessionId()));
      } catch (error) {
        if (prepared) monitorAfterBlockingError(prepared, ctx, generation);
        throw error;
      }
      if (!ownsRun(run, ctx, generation)) throw new Error("Subagent launch continuation was abandoned after session ownership changed.");
      pi.appendEntry("subagent_run", { ...run });
      updateStatus(ctx);
      if (shouldWatchCompletion(parameters.mode ?? "blocking", false)) {
        void watchRun(run, ctx);
        return { content: [{ type: "text", text: `Started background subagent ${run.id}. Inspect with subagent_status; tmux attach -t ${run.tmux}` }], details: { ...run } };
      }
      const deadline = run.deadline!;
      try {
        while (await refreshStatus(run, ctx, generation)) {
          if (signal?.aborted || Date.now() >= deadline) {
            if ((parameters.onTimeout ?? "terminate") === "terminate") {
              await terminateRun(run, signal?.aborted ? "cancelled" : "timed_out", ctx, generation);
              requireOwnership(run, ctx, generation);
              if (!signal?.aborted && run.status === "timed_out") {
                run.notifyOnCompletion = true;
                pi.appendEntry("subagent_run", { ...run });
              }
              if (run.status === "completed" || run.status === "failed") break;
            } else if (!isTerminalStatus(run.status)) {
              run.notifyOnCompletion = true;
              pi.appendEntry("subagent_run", { ...run });
              void watchRun(run, ctx);
            }
            updateStatus(ctx);
            return { content: [{ type: "text", text: `Subagent ${run.id}: ${run.status} (${parameters.onTimeout ?? "terminate"}).` }], details: { ...run } };
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        monitorAfterBlockingError(run, ctx, generation);
        throw error;
      }
      updateStatus(ctx);
      const report = await finalReport(run);
      requireOwnership(run, ctx, generation);
      if (run.status === "failed") throw new Error(`Subagent ${run.id} failed: ${report}`);
      return { content: [{ type: "text", text: report }], details: { ...run, completionRetrieved: true } };
    } });
  pi.registerTool({ name: "subagent_result", label: "Subagent Result", description: "Retrieve a subagent's final report and terminal state by run ID, including results whose completion notification was missed.", parameters: RunIdSchema,
    renderCall(parameters, theme) { return new Text(theme.fg("toolTitle", theme.bold(formatIdCall("subagent_result", parameters.runId))), 0, 0); },
    async execute(_id, parameters, _signal, _update, ctx) {
      const run = runs.get(parameters.runId);
      if (!run) throw new Error("Unknown subagent run.");
      const generation = sessionGeneration;
      await refreshStatus(run, ctx, generation);
      updateStatus(ctx);
      const terminal = isTerminalStatus(run.status);
      const report = terminal ? await finalReport(run) : undefined;
      requireOwnership(run, ctx, generation);
      // Only this tool's persisted result proves retrieval; execute/tool_result/message_end are too early.
      return { content: [{ type: "text", text: report === undefined ? `${run.id}: ${run.status}` : `${run.id}: ${run.status}\n${report}` }], details: { ...run, completionRetrieved: terminal && ownsRun(run, ctx, generation) } };
    } });
  pi.registerTool({ name: "subagent_status", label: "Subagent Status", description: "Check a tmux subagent without adding its intermediate output to context.", parameters: RunIdSchema,
    renderCall(parameters, theme) { return new Text(theme.fg("toolTitle", theme.bold(formatIdCall("subagent_status", parameters.runId))), 0, 0); },
    async execute(_id, parameters, _signal, _update, ctx) { const run = runs.get(parameters.runId); if (!run) throw new Error("Unknown subagent run."); const generation = sessionGeneration; await refreshStatus(run, ctx, generation); updateStatus(ctx); const events = await readFile(join(run.dir, "events.jsonl"), "utf8").catch(() => ""); requireOwnership(run, ctx, generation); const last = events.trim().split("\n").reverse().map((line) => { try { return summarizeWorkerEvent(JSON.parse(line)); } catch { return undefined; } }).find(Boolean); const elapsed = Math.floor((Date.now() - run.started) / 1000); return { content: [{ type: "text", text: `${run.id}: ${run.status}${last ? ` (${last})` : ""}; ${elapsed}s elapsed\nartifacts: ${run.dir}\ntmux attach -t ${run.tmux}` }], details: run }; } });
  pi.registerTool({ name: "subagent_cancel", label: "Cancel Subagent", description: "Terminate a running tmux subagent.", parameters: RunIdSchema,
    renderCall(parameters, theme) { return new Text(theme.fg("toolTitle", theme.bold(formatIdCall("subagent_cancel", parameters.runId))), 0, 0); },
    async execute(_id, parameters, _signal, _update, ctx) {
      const run = runs.get(parameters.runId);
      if (!run) throw new Error("Unknown subagent run.");
      const generation = sessionGeneration;
      if (ownsRun(run, ctx, generation)) {
        run.completionSuppressed = true;
        pi.appendEntry("subagent_run", { ...run });
      }
      await terminateRun(run, "cancelled", ctx, generation);
      if (ownsRun(run, ctx, generation)) updateStatus(ctx);
      return { content: [{ type: "text", text: `${run.id}: ${run.status}` }], details: { ...run } };
    } });
  pi.on("session_start", async (_event, ctx) => {
    sessionClosing = false;
    sessionGeneration += 1;
    runs.clear();

    const generation = sessionGeneration;
    // Process state is session-wide (tree navigation cannot undo a kill); consumption is branch-local.
    const entries = ctx.sessionManager.getEntries();
    const latestRuns = new Map<string, Run>();
    for (const entry of entries) {
      if (entry.type !== "custom" || entry.customType !== "subagent_run" || !isRun(entry.data)) continue;
      if (!shouldInjectCompletion(entry.data.sessionId, ctx.sessionManager.getSessionId())) continue;
      latestRuns.set(entry.data.id, { ...entry.data });
    }
    for (const run of latestRuns.values()) runs.set(run.id, { ...run, notifyOnCompletion: true });

    // Migrate only each worker's latest snapshot; never mutate historical session entries.
    for (const run of runs.values()) {
      if (run.status === "timed_out" && run.onTimeout === "keep_running" && !run.terminationIntent && run.launchDeadline === undefined) run.status = "running";
      const hasLegacyTimeoutMetadata = run.onTimeout !== undefined || run.deadline !== undefined;
      if (!(["running", "timed_out"].includes(run.status)) || hasLegacyTimeoutMetadata || run.terminationIntent) continue;
      try {
        if (await isRunning(pi, run)) {
          if (!ownsRun(run, ctx, generation)) return;
          run.status = "running";
          run.onTimeout = "keep_running";
          pi.appendEntry("subagent_run", { ...run });
        } else {
          const exitCode = await readFile(join(run.dir, "exit-code"), "utf8").catch(() => "");
          if (!ownsRun(run, ctx, generation)) return;
          const status = naturalExitStatus(exitCode);
          if (status) {
            run.status = status;
            pi.appendEntry("subagent_run", { ...run });
          }
        }
      } catch {
        if (!ownsRun(run, ctx, generation)) return;
        // An inconclusive legacy probe must not lose the worker; monitor conservatively without killing it.
        run.status = "running";
        run.onTimeout = "keep_running";
        pi.appendEntry("subagent_run", { ...run });
      }
    }
    for (const run of runs.values()) {
      if (!ownsRun(run, ctx, generation)) return;
      try {
        if (run.terminationIntent && run.status !== "launching") {
          const intent = run.terminationIntent;
          const live = await isRunning(pi, run);
          if (!ownsRun(run, ctx, generation)) return;
          if (isTerminalStatus(run.status)) continue;
          if (run.terminationIntent !== intent) { void watchRun(run, ctx, generation); continue; }
          if (!live) {
            const exitCode = await readFile(join(run.dir, "exit-code"), "utf8").catch(() => "");
            if (!ownsRun(run, ctx, generation)) return;
            if (isTerminalStatus(run.status)) continue;
            if (run.terminationIntent !== intent) { void watchRun(run, ctx, generation); continue; }
            run.status = naturalExitStatus(exitCode) ?? intent;
            run.terminationIntent = undefined;
            pi.appendEntry("subagent_run", { ...run });
          } else {
            run.status = "running";
            void terminateRun(run, run.terminationIntent, ctx, generation).catch((error) => {
              if (ownsRun(run, ctx, generation)) ctx.ui.notify(String(error), "warning");
            });
          }
        }
        const running = await refreshStatus(run, ctx, generation);
        if (!ownsRun(run, ctx, generation)) return;
        if (running && run.notifyOnCompletion) void watchRun(run, ctx, generation);
      } catch (error) {
        if (!ownsRun(run, ctx, generation)) return;
        if (!isTerminalStatus(run.status) && run.status !== "launching") run.status = "running";
        if (run.notifyOnCompletion) void watchRun(run, ctx, generation);
        ctx.ui.notify(`Could not restore subagent ${run.id}; monitoring will retry: ${String(error)}`, "warning");
      }
    }
    if (generation === sessionGeneration && !sessionClosing) updateStatus(ctx);
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    sessionClosing = true;
    sessionGeneration += 1;
    const active = [...runs.values()].filter((run) => countRunningRuns([run.status]) > 0); if (active.length > 0) ctx.ui.notify(`${active.length} subagent worker${active.length === 1 ? " remains" : "s remain"} active in tmux.`, "warning"); });
}
