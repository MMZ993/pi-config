import assert from "node:assert/strict";
import test from "node:test";

import backgroundTerminal from "../extensions/bg-terminal/index.ts";
import { completionNeedsDelivery, shouldDeliverCompletion, shouldRestoreJob, shouldWatchRestoredJob } from "../src/bg-terminal/state.ts";

test("a completed job is delivered once only when its originating session resumes", () => {
  assert.equal(completionNeedsDelivery("origin", "origin", false), true);
  assert.equal(completionNeedsDelivery("origin", "fresh", false), false);
  assert.equal(completionNeedsDelivery("origin", "origin", true), false);
});

test("a restored running job resumes completion monitoring", () => {
  assert.equal(shouldWatchRestoredJob("running"), true);
  assert.equal(shouldWatchRestoredJob("completed"), false);
});

test("session restoration includes only jobs owned by the active session", () => {
  assert.equal(shouldRestoreJob("active", "active"), true);
  assert.equal(shouldRestoreJob("other", "active"), false);
});

test("a pending or successful cancellation suppresses completion delivery", () => {
  assert.equal(shouldDeliverCompletion("completed", false), true);
  assert.equal(shouldDeliverCompletion("completed", true), false);
  assert.equal(shouldDeliverCompletion("cancelled", false), false);
});

type Result = { code: number; stderr: string };

function createExtension(exec: (args: string[]) => Promise<Result>) {
  const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
  const events = new Map<string, (...args: any[]) => Promise<void>>();
  const entries: Array<{ type: string; data: unknown }> = [];
  const messages: unknown[] = [];
  backgroundTerminal({
    exec: (_command: string, args: string[]) => exec(args),
    registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool),
    on: (event: string, handler: (...args: any[]) => Promise<void>) => events.set(event, handler),
    appendEntry: (type: string, data: unknown) => entries.push({ type, data }),
    sendMessage: (message: unknown) => messages.push(message),
  } as any);
  const context = (sessionId: string, sessionEntries: unknown[] = []) => ({
    hasUI: true,
    cwd: process.cwd(),
    ui: { confirm: async () => true, notify: () => {}, setStatus: () => {} },
    sessionManager: { getSessionId: () => sessionId, getEntries: () => sessionEntries },
  });
  return { context, entries, events, messages, tools };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("session_start rebuilds the job list for only the active session", async () => {
  const extension = createExtension(async () => ({ code: 1, stderr: "" }));
  const job = (id: string, sessionId: string) => ({ id, tmux: id, dir: "/tmp", sessionId, title: id, command: "true", started: 0, status: "running" });
  await extension.events.get("session_start")!({}, extension.context("first", [{ type: "custom", customType: "bg_terminal_job", data: job("first", "first") }]));
  await extension.events.get("session_start")!({}, extension.context("second", [
    { type: "custom", customType: "bg_terminal_job", data: job("first", "first") },
    { type: "custom", customType: "bg_terminal_job", data: job("second", "second") },
  ]));
  const result = await extension.tools.get("bg_list")!.execute("id", {}, undefined, undefined, extension.context("second"));
  assert.deepEqual(result.details.map((item: { id: string }) => item.id), ["second"]);
});

test("a successful kill suppresses a watcher completion", async () => {
  let releaseWatch!: (result: Result) => void;
  let releaseKill!: (result: Result) => void;
  const watchResult = new Promise<Result>((resolve) => { releaseWatch = resolve; });
  const killResult = new Promise<Result>((resolve) => { releaseKill = resolve; });
  const extension = createExtension(async (args) => args[0] === "new-session" ? { code: 0, stderr: "" } : args[0] === "kill-session" ? killResult : watchResult);
  const ctx = extension.context("active");
  const started = await extension.tools.get("bg_start")!.execute("id", { command: "true" }, undefined, undefined, ctx);
  const killed = extension.tools.get("bg_kill")!.execute("id", { jobId: started.details.id }, undefined, undefined, ctx);
  await flush();
  releaseWatch({ code: 1, stderr: "" });
  await flush();
  releaseKill({ code: 0, stderr: "" });
  await killed;
  assert.equal(extension.messages.length, 0);
  assert.equal(extension.entries.some((entry) => entry.type === "bg_terminal_completion"), false);
});

test("a failed kill rejects without recording cancellation success", async () => {
  let releaseWatch!: (result: Result) => void;
  let releaseKill!: (result: Result) => void;
  const watchResult = new Promise<Result>((resolve) => { releaseWatch = resolve; });
  const killResult = new Promise<Result>((resolve) => { releaseKill = resolve; });
  let hasSessionCalls = 0;
  const extension = createExtension(async (args) => {
    if (args[0] === "new-session") return { code: 0, stderr: "" };
    if (args[0] === "kill-session") return killResult;
    hasSessionCalls += 1;
    return hasSessionCalls === 1 ? watchResult : { code: 1, stderr: "" };
  });
  const ctx = extension.context("active");
  const started = await extension.tools.get("bg_start")!.execute("id", { command: "true" }, undefined, undefined, ctx);
  const killed = extension.tools.get("bg_kill")!.execute("id", { jobId: started.details.id }, undefined, undefined, ctx);
  await flush();
  releaseWatch({ code: 1, stderr: "" });
  await flush();
  releaseKill({ code: 1, stderr: "tmux failed" });
  await assert.rejects(killed, /Failed to cancel/);
  assert.equal(extension.entries.some((entry) => entry.type === "bg_terminal_cancel"), false);
});
