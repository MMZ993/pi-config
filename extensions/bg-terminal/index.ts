import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { formatBackgroundStartCall, formatIdCall } from "../../src/tool-rendering/call-labels.ts";
import { completionNeedsDelivery, countRunningJobs, shouldDeliverCompletion, shouldRestoreJob, shouldWatchRestoredJob } from "../../src/bg-terminal/state.ts";

const StartSchema = Type.Object({
  command: Type.String({ minLength: 1, description: "A non-interactive shell command to run." }),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  cwd: Type.Optional(Type.String({ minLength: 1 })),
});
const JobIdSchema = Type.Object({ jobId: Type.String() });
type StartParameters = Static<typeof StartSchema>;
type Job = { id: string; tmux: string; dir: string; sessionId: string; title: string; command: string; started: number; status: string; cancellationPending?: boolean };

function isJob(value: unknown): value is Job {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<Job>;
  return typeof job.id === "string" && typeof job.tmux === "string" && typeof job.dir === "string" && typeof job.sessionId === "string" && typeof job.title === "string" && typeof job.command === "string";
}
function shellQuote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }
function jobLine(job: Job): string { return `${job.id} (${job.title}): ${job.status}; artifacts: ${job.dir}`; }

export default function backgroundTerminal(pi: ExtensionAPI): void {
  const jobs = new Map<string, Job>();
  const deliveredJobs = new Set<string>();
  let sessionClosing = false;
  let sessionGeneration = 0;
  const refresh = async (job: Job): Promise<boolean> => {
    const result = await pi.exec("tmux", ["has-session", "-t", job.tmux], { timeout: 5_000 });
    if (result.code === 0) { if (!job.cancellationPending) job.status = "running"; return true; }
    if (job.status === "cancelled") return false;
    const exitCode = (await readFile(join(job.dir, "exit-code"), "utf8").catch(() => "")).trim();
    job.status = exitCode === "0" ? "completed" : exitCode ? "failed" : "unknown";
    return false;
  };
  const updateFooter = (ctx: { ui: { setStatus(key: string, value: string | undefined): void } }): void => {
    const running = countRunningJobs([...jobs.values()].map((job) => job.status));
    ctx.ui.setStatus("bg-terminal", running ? `${running} background job${running === 1 ? "" : "s"} running` : undefined);
  };
  const notifyCompletion = async (job: Job, ctx: ExtensionContext): Promise<void> => {
    if (deliveredJobs.has(job.id)) return;
    deliveredJobs.add(job.id);
    const exitCode = (await readFile(join(job.dir, "exit-code"), "utf8").catch(() => "unknown")).trim() || "unknown";
    pi.sendMessage({ customType: "bg_terminal_completion", content: `Background job ${job.title} ${job.status} (exit ${exitCode}). Artifacts: ${job.dir}`, display: true }, { deliverAs: "nextTurn" });
    pi.appendEntry("bg_terminal_completion", { jobId: job.id });
  };
  const watch = async (job: Job, ctx: ExtensionContext, generation = sessionGeneration): Promise<void> => {
    while (generation === sessionGeneration && await refresh(job)) await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (generation !== sessionGeneration) return;
    updateFooter(ctx);
    if (!sessionClosing && shouldDeliverCompletion(job.status, job.cancellationPending === true) && completionNeedsDelivery(job.sessionId, ctx.sessionManager.getSessionId(), deliveredJobs.has(job.id))) await notifyCompletion(job, ctx);
  };
  const getJob = (jobId: string): Job => {
    const job = jobs.get(jobId);
    if (!job) throw new Error("Unknown background job.");
    return job;
  };

  pi.registerTool({ name: "bg_start", label: "Start Background Job", description: "Run a non-interactive shell command in detached tmux with retained /tmp artifacts.", parameters: StartSchema,
    renderCall(parameters, theme) { return new Text(theme.fg("toolTitle", theme.bold(formatBackgroundStartCall(parameters))), 0, 0); },
    async execute(_id, parameters, _signal, _update, ctx) {
      if (parameters.command.includes("\0")) throw new Error("Command must not contain a NUL byte.");
      if (!ctx.hasUI) throw new Error("Background commands require an interactive confirmation.");
      const approved = await ctx.ui.confirm("Start background command?", `This command will run detached in tmux:\n\n${parameters.command}`);
      if (!approved) throw new Error("Background command was not confirmed.");
      const id = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const dir = await mkdtemp(join(tmpdir(), "pi-bg-terminal-"));
      const job: Job = { id, tmux: id, dir, sessionId: ctx.sessionManager.getSessionId(), title: parameters.title ?? id, command: parameters.command, started: Date.now(), status: "running" };
      const commandPath = join(dir, "command.sh");
      const scriptPath = join(dir, "run.sh");
      const script = `#!/bin/sh\n/bin/sh ${shellQuote(commandPath)} >${shellQuote(join(dir, "stdout.log"))} 2>${shellQuote(join(dir, "stderr.log"))}\nprintf '%s' $? >${shellQuote(join(dir, "exit-code"))}\n`;
      await writeFile(commandPath, parameters.command, { mode: 0o600 });
      await writeFile(scriptPath, script, { mode: 0o700 });
      const created = await pi.exec("tmux", ["new-session", "-d", "-s", job.tmux, "-c", parameters.cwd ?? ctx.cwd, "/bin/sh", scriptPath], { timeout: 5_000 });
      if (created.code !== 0) throw new Error(`Failed to start tmux job: ${created.stderr.trim()}`);
      jobs.set(id, job); pi.appendEntry("bg_terminal_job", job); updateFooter(ctx); void watch(job, ctx);
      return { content: [{ type: "text", text: `Started ${job.id} (${job.title}). Artifacts: ${job.dir}` }], details: job };
    } });
  pi.registerTool({ name: "bg_status", label: "Background Job Status", description: "Check a background terminal job and its retained artifacts.", parameters: JobIdSchema,
    renderCall(parameters, theme) { return new Text(theme.fg("toolTitle", theme.bold(formatIdCall("bg_status", parameters.jobId))), 0, 0); },
    async execute(_id, parameters, _signal, _update, ctx) { const job = getJob(parameters.jobId); await refresh(job); updateFooter(ctx); return { content: [{ type: "text", text: jobLine(job) }], details: job }; } });
  pi.registerTool({ name: "bg_list", label: "List Background Jobs", description: "List background terminal jobs from this Pi session.", parameters: Type.Object({}),
    renderCall(_parameters, theme) { return new Text(theme.fg("toolTitle", theme.bold("bg_list")), 0, 0); },
    async execute(_id, _parameters, _signal, _update, ctx) { for (const job of jobs.values()) await refresh(job); updateFooter(ctx); const text = [...jobs.values()].map(jobLine).join("\n") || "No background jobs."; return { content: [{ type: "text", text }], details: [...jobs.values()] }; } });
  pi.registerTool({ name: "bg_kill", label: "Kill Background Job", description: "Terminate a running background terminal tmux session.", parameters: JobIdSchema,
    renderCall(parameters, theme) { return new Text(theme.fg("toolTitle", theme.bold(formatIdCall("bg_kill", parameters.jobId))), 0, 0); },
    async execute(_id, parameters, _signal, _update, ctx) {
      const job = getJob(parameters.jobId);
      job.cancellationPending = true;
      const result = await pi.exec("tmux", ["kill-session", "-t", job.tmux], { timeout: 5_000 });
      if (result.code !== 0) {
        job.cancellationPending = false;
        if (!await refresh(job) && !sessionClosing && shouldDeliverCompletion(job.status, false) && completionNeedsDelivery(job.sessionId, ctx.sessionManager.getSessionId(), deliveredJobs.has(job.id))) await notifyCompletion(job, ctx);
        updateFooter(ctx);
        throw new Error(`Failed to cancel ${job.id}: ${result.stderr.trim()}`);
      }
      job.cancellationPending = false;
      job.status = "cancelled";
      pi.appendEntry("bg_terminal_cancel", { jobId: job.id });
      updateFooter(ctx);
      return { content: [{ type: "text", text: `Cancelled ${job.id}. Artifacts retained at ${job.dir}` }], details: job };
    } });
  pi.on("session_start", async (_event, ctx) => {
    sessionClosing = false;
    sessionGeneration += 1;
    jobs.clear();
    deliveredJobs.clear();
    const entries = ctx.sessionManager.getEntries() as Array<{ type?: string; customType?: string; data?: unknown }>;
    const delivered = new Set(entries.filter((entry) => entry.type === "custom" && entry.customType === "bg_terminal_completion").map((entry) => (entry.data as { jobId?: string } | undefined)?.jobId).filter((jobId): jobId is string => typeof jobId === "string"));
    const cancelled = new Set(entries.filter((entry) => entry.type === "custom" && entry.customType === "bg_terminal_cancel").map((entry) => (entry.data as { jobId?: string } | undefined)?.jobId).filter((jobId): jobId is string => typeof jobId === "string"));
    for (const entry of entries) {
      if (entry.type !== "custom" || entry.customType !== "bg_terminal_job" || !isJob(entry.data)) continue;
      const job = entry.data;
      if (!shouldRestoreJob(job.sessionId, ctx.sessionManager.getSessionId())) continue;
      if (delivered.has(job.id)) deliveredJobs.add(job.id);
      if (cancelled.has(job.id)) job.status = "cancelled";
      jobs.set(job.id, job);
      if (job.status === "cancelled") continue;
      if (await refresh(job)) { if (shouldWatchRestoredJob(job.status)) void watch(job, ctx); continue; }
      if (completionNeedsDelivery(job.sessionId, ctx.sessionManager.getSessionId(), delivered.has(job.id))) await notifyCompletion(job, ctx);
    }
    updateFooter(ctx);
  });
  pi.on("session_shutdown", async (_event, ctx) => { sessionClosing = true; const running = [...jobs.values()].filter((job) => job.status === "running").length; if (running) ctx.ui.notify(`${running} background job${running === 1 ? " remains" : "s remain"} running in tmux.`, "warning"); });
}
