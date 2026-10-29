import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import subagents from "../extensions/subagents/index.ts";

/** Models Pi's separate volatile queue, persisted session history, and active branch. No workers are launched. */
function lifecycle(entries: any[] = [], exec = async (_command: string, _args: string[]) => ({ code: 1, stderr: "" })) {
  const tools = new Map<string, any>();
  const handlers = new Map<string, any>();
  const queue: any[] = [];
  const warnings: string[] = [];
  let sessionId = "origin";
  let branch = entries;
  subagents({
    exec,
    registerTool: (tool: any) => tools.set(tool.name, tool),
    on: (event: string, handler: any) => handlers.set(event, handler),
    appendEntry: (customType: string, data: any) => entries.push({ type: "custom", customType, data: structuredClone(data) }),
    sendMessage: (message: any) => queue.push(message),
  } as any);
  const context = {
    cwd: "/tmp", model: { id: "m", provider: "p" }, modelRegistry: { find: () => ({}) },
    sessionManager: { getSessionId: () => sessionId, getEntries: () => entries, getBranch: () => branch },
    ui: { setStatus: () => {}, notify: (text: string) => warnings.push(text) },
  };
  return {
    entries, queue, context, warnings,
    start: () => handlers.get("session_start")({}, context),
    stop: () => handlers.get("session_shutdown")({}, context),
    beforeStart: () => handlers.get("before_agent_start")({}, context),
    changeSession: (id: string) => { sessionId = id; },
    changeBranch: (value: any[]) => { branch = value; },
    call: (name: string, parameters: any, signal?: AbortSignal) => tools.get(name).execute("call", parameters, signal, undefined, context),
  };
}

/** Returns a persisted run fixture with explicit ownership and policy; tests override selected fields. */
function runRecord(overrides: Record<string, unknown> = {}) {
  return { id: "worker", tmux: "worker", dir: "/tmp/nonexistent-subagent-lifecycle", sessionId: "origin", started: Date.now(), tools: ["read"], status: "completed", notifyOnCompletion: true, ...overrides };
}

/** Wraps a worker snapshot in Pi's durable custom entry format. */
function runEntry(run: ReturnType<typeof runRecord>) {
  return { type: "custom", customType: "subagent_run", data: run };
}

/** Models Pi's persistence after execute and all result/message hooks return. */
function resultEntry(result: any, toolName = "subagent_result") {
  return { type: "message", message: { role: "toolResult", toolName, isError: false, ...structuredClone(result) } };
}

/** Lets mocked I/O settle without advancing polling timers. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

/** Exposes a deterministic gate for races at asynchronous I/O boundaries. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("reload before the next prompt leaves no duplicate Pi queue and one completion", async () => {
  const fixture = lifecycle([runEntry(runRecord())]);
  await fixture.start();
  assert.deepEqual(fixture.queue, [], "Pi's uncancellable nextTurn queue must not be used");
  await fixture.stop();
  const resumed = lifecycle(structuredClone(fixture.entries));
  await resumed.start();
  const proposed = await resumed.beforeStart();
  assert.match(proposed.message.content, /Subagent worker completed/);
  assert.deepEqual(proposed.message.details.runIds, ["worker"]);
  assert.deepEqual(resumed.queue, []);
  resumed.entries.push({ type: "custom_message", ...proposed.message });
  assert.equal(await resumed.beforeStart(), undefined);
  await resumed.stop();
  const persisted = lifecycle(structuredClone(resumed.entries));
  await persisted.start();
  assert.equal(await persisted.beforeStart(), undefined);
  await persisted.stop();
});

test("a proposed completion is retried after a crash before message persistence", async () => {
  const fixture = lifecycle([runEntry(runRecord())]);
  await fixture.start();
  assert.ok((await fixture.beforeStart()).message);
  await fixture.stop();
  const crashed = lifecycle(structuredClone(fixture.entries));
  await crashed.start();
  assert.ok((await crashed.beforeStart()).message);
  await crashed.stop();
});

test("subagent_result exposes only status while a worker is still running", async (t) => {
  const fixture = lifecycle([runEntry(runRecord({ status: "running" }))], async () => ({ code: 0, stderr: "" }));
  const originalRead = fs.readFile;
  const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => {
    if (String(path).endsWith("events.jsonl")) return Promise.resolve('{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"intermediate report"}]}}');
    return (originalRead as any)(path, ...args);
  });
  syncBuiltinESMExports();
  try {
    await fixture.start();
    const result = await fixture.call("subagent_result", { runId: "worker" });
    assert.equal(result.content[0].text, "worker: running");
    assert.equal(result.details.completionRetrieved, false);
  } finally {
    await fixture.stop();
    mock.mock.restore();
    syncBuiltinESMExports();
  }
});

test("retrieval acknowledges only its persisted result, not execute or pre-result markers", async () => {
  const fixture = lifecycle([runEntry(runRecord()), { type: "custom", customType: "subagent_completion", data: { runId: "worker", retrieved: true } }]);
  await fixture.start();
  const result = await fixture.call("subagent_result", { runId: "worker" });
  assert.equal(result.details.completionRetrieved, true);
  assert.equal(fixture.entries.length, 2, "execute must not persist an acknowledgement before its result");
  assert.ok((await fixture.beforeStart()).message, "a lost tool result must be retried");
  fixture.entries.push(resultEntry(result));
  assert.equal(await fixture.beforeStart(), undefined, "persisted retrieval suppresses completion at prompt time");
  await fixture.stop();
  const resumed = lifecycle(structuredClone(fixture.entries));
  await resumed.start();
  assert.equal(await resumed.beforeStart(), undefined);
  await resumed.stop();
});

test("legacy queue markers do not acknowledge results; legacy persisted messages do", async () => {
  for (const persisted of [false, true]) {
    const entries: any[] = [runEntry(runRecord()), { type: "custom", customType: "subagent_completion", data: { runId: "worker" } }];
    if (persisted) entries.push({ type: "custom_message", customType: "subagent_completion", content: "Subagent worker completed:\nlegacy report" });
    const fixture = lifecycle(entries);
    await fixture.start();
    assert.equal(Boolean(await fixture.beforeStart()), !persisted);
    await fixture.stop();
  }
});

test("multiple unseen completions are batched and acknowledged independently", async () => {
  const fixture = lifecycle([runEntry(runRecord()), runEntry(runRecord({ id: "other" }))]);
  await fixture.start();
  fixture.entries.push(resultEntry(await fixture.call("subagent_result", { runId: "worker" })));
  const proposed = await fixture.beforeStart();
  assert.deepEqual(proposed.message.details.runIds, ["other"]);
  fixture.entries.push({ type: "custom_message", ...proposed.message });
  assert.equal(await fixture.beforeStart(), undefined);
  await fixture.stop();
});

test("abandoned-branch completion evidence does not hide results on the active branch", async () => {
  for (const kind of ["custom", "result"]) {
    const base = runEntry(runRecord());
    const evidence = kind === "custom"
      ? { type: "custom_message", customType: "subagent_completion", details: { runIds: ["worker"] } }
      : resultEntry({ details: { ...base.data, completionRetrieved: true } });
    const fixture = lifecycle([base, evidence]);
    await fixture.start();
    assert.equal(await fixture.beforeStart(), undefined);
    fixture.changeBranch([base]);
    assert.ok((await fixture.beforeStart()).message, "tree navigation must invalidate branch-local consumption without reloading");
    fixture.changeBranch([base, evidence]);
    assert.equal(await fixture.beforeStart(), undefined);
    await fixture.stop();
  }
});

test("blocking terminate timeout persists its notification for the next prompt", async () => {
  const originalNow = Date.now;
  let now = originalNow();
  let probed = false;
  const fixture = lifecycle([], async (_command, args) => {
    if (args[0] === "has-session" && !probed) { probed = true; now += 31_000; }
    return { code: 0, stderr: "" };
  });
  Date.now = () => now;
  try {
    const result = await fixture.call("subagent_run", { task: "wait", timeoutSeconds: 30 });
    assert.equal(result.details.status, "timed_out");
    assert.equal(result.content[0].text, `Subagent ${result.details.id}: timed_out (terminate).`);
    assert.equal(fixture.entries.at(-1).data.notifyOnCompletion, true);
    const proposed = await fixture.beforeStart();
    assert.match(proposed.message.content, /timed_out/);
  } finally { Date.now = originalNow; await fixture.stop(); }
});

test("blocking timeout result leaves its report deliverable at the next prompt", async () => {
  const run = runRecord({ status: "timed_out" });
  const fixture = lifecycle([runEntry(run), resultEntry({ details: run }, "subagent_run")]);
  await fixture.start();
  assert.match((await fixture.beforeStart()).message.content, /Subagent worker timed_out/);
  await fixture.stop();
  const resumed = lifecycle(structuredClone(fixture.entries));
  await resumed.start();
  assert.match((await resumed.beforeStart()).message.content, /Subagent worker timed_out/);
  await resumed.stop();
});

test("failed tool results never acknowledge a completion", async () => {
  const entry = resultEntry({ details: { ...runRecord(), completionRetrieved: true } });
  entry.message.isError = true;
  const fixture = lifecycle([runEntry(runRecord()), entry]);
  await fixture.start();
  assert.ok((await fixture.beforeStart()).message);
  await fixture.stop();
});

test("reading progress never acknowledges a final report even if the worker finishes during the read", async (t) => {
  let running = true;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", notifyOnCompletion: false, deadline: Date.now() + 300_000, onTimeout: "keep_running" }))], async () => ({ code: running ? 0 : 1, stderr: "" }));
  await fixture.start();
  const entered = deferred<void>();
  const report = deferred<string>();
  const originalRead = fs.readFile;
  const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => {
    if (String(path).endsWith("events.jsonl")) { entered.resolve(); return report.promise; }
    if (String(path).endsWith("exit-code")) return Promise.resolve("0");
    return (originalRead as any)(path, ...args);
  });
  syncBuiltinESMExports();
  const retrieving = fixture.call("subagent_status", { runId: "worker" });
  try {
    await entered.promise;
    running = false;
    const status = fixture.call("subagent_status", { runId: "worker" });
    await settle();
    report.resolve("");
    await status;
    const result = await retrieving;
    assert.equal(result.details.status, "completed");
    assert.equal(fixture.entries.length, 1);
  } finally {
    report.resolve("");
    await retrieving;
    await fixture.stop();
    mock.mock.restore();
    syncBuiltinESMExports();
  }
});

test("cancelling a finished pending completion suppresses it without rewriting terminal state or killing", async () => {
  const calls: string[][] = [];
  const fixture = lifecycle([runEntry(runRecord())], async (_command, args) => { calls.push(args); return { code: 0, stderr: "" }; });
  await fixture.start();
  const result = await fixture.call("subagent_cancel", { runId: "worker" });
  assert.equal(result.details.status, "completed");
  assert.equal(result.details.completionSuppressed, true);
  assert.equal(calls.length, 0);
  assert.equal(await fixture.beforeStart(), undefined);
  await fixture.stop();
  const resumed = lifecycle(structuredClone(fixture.entries));
  await resumed.start();
  assert.equal(await resumed.beforeStart(), undefined);
  await resumed.stop();
});

test("report preparation rechecks cancellation, persisted retrieval, shutdown, generation, and ownership", async (t) => {
  const originalRead = fs.readFile;
  for (const transition of ["cancel", "retrieve", "shutdown", "generation", "ownership"]) {
    const entered = deferred<void>();
    const report = deferred<string>();
    const fixture = lifecycle([runEntry(runRecord())]);
    await fixture.start();
    const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => {
      if (String(path).endsWith("events.jsonl")) { entered.resolve(); return report.promise; }
      return (originalRead as any)(path, ...args);
    });
    syncBuiltinESMExports();
    const preparing = fixture.beforeStart();
    try {
      await entered.promise;
      if (transition === "cancel") await fixture.call("subagent_cancel", { runId: "worker" });
      if (transition === "retrieve") fixture.entries.push(resultEntry({ details: { ...runRecord(), completionRetrieved: true } }));
      if (transition === "shutdown") await fixture.stop();
      if (transition === "generation") { fixture.entries.length = 0; await fixture.start(); }
      if (transition === "ownership") fixture.changeSession("other");
      report.resolve("");
      assert.equal(await preparing, undefined, transition);
      assert.deepEqual(fixture.queue, []);
    } finally {
      report.resolve("");
      await preparing;
      await fixture.stop();
      mock.mock.restore();
      syncBuiltinESMExports();
    }
  }
});

test("worker launch persists model, cwd, reasoning and original timeout policy", async () => {
  const fixture = lifecycle([], async () => ({ code: 0, stderr: "" }));
  try {
    const result = await fixture.call("subagent_run", { task: "inspect", mode: "background", cwd: "/workspace/worker", thinkingLevel: "high", timeoutSeconds: 30, onTimeout: "keep_running" });
    assert.equal(result.details.cwd, "/workspace/worker");
    assert.equal(result.details.model, "p/m");
    assert.equal(result.details.reasoning, "high");
    assert.equal(result.details.deadline, result.details.started + 30_000);
    assert.equal(result.details.onTimeout, "keep_running");
    assert.match((await fixture.call("subagent_result", { runId: result.details.id })).content[0].text, /running/);
  } finally { await fixture.stop(); }
});

test("persisted background launch details cannot acknowledge a final report", async () => {
  const run = runRecord({ status: "completed" });
  const fixture = lifecycle([runEntry(run), resultEntry({ details: run }, "subagent_run")]);
  try {
    await fixture.start();
    assert.ok((await fixture.beforeStart()).message, "terminal launch details are not report delivery evidence");
  } finally { await fixture.stop(); }
});

test("shutdown warns about workers whose launch is still in progress", async () => {
  const fixture = lifecycle([runEntry(runRecord({ status: "launching" }))], async () => ({ code: 1, stderr: "" }));
  await fixture.start();
  await fixture.stop();
  assert.match(fixture.warnings.at(-1) ?? "", /1 subagent worker remains active in tmux/);
});

test("restored launching worker is reconciled as live before expiry and honors keep_running", async () => {
  const dir = await fs.mkdtemp("/tmp/pi-subagent-test-");
  await fs.writeFile(`${dir}/launch-state`, "started");
  const calls: string[][] = [];
  const fixture = lifecycle([runEntry(runRecord({ status: "launching", dir, deadline: 1, launchDeadline: 1, onTimeout: "keep_running" }))], async (_command, args) => {
    calls.push(args);
    return { code: args[0] === "has-session" ? 0 : 1, stderr: "" };
  });
  try {
    await fixture.start();
    assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, "running");
    assert.equal(calls.some((args) => args[0] === "kill-session"), false);
  } finally { await fixture.stop(); }
});

test("continued keep_running workers retain their policy after the original wait", async () => {
  const calls: string[][] = [];
  const fixture = lifecycle([], async (_command, args) => { calls.push(args); return { code: 0, stderr: "" }; });
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const result = await fixture.call("subagent_run", { task: "wait", timeoutSeconds: 30, onTimeout: "keep_running" }, AbortSignal.abort());
    now += 301_000;
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.equal(calls.some((args) => args[0] === "kill-session"), false);
    assert.equal(result.details.status, "running");
    assert.equal(result.details.onTimeout, "keep_running");
    assert.equal(result.details.deadline, now - 301_000 + 30_000);
  } finally { Date.now = originalNow; await fixture.stop(); }
});

test("restored timeout policies retain the original deadline and never kill keep_running", async () => {
  for (const onTimeout of ["terminate", "keep_running"]) {
    const calls: string[][] = [];
    const fixture = lifecycle([runEntry(runRecord({ status: "running", deadline: 1, onTimeout }))], async (_command, args) => { calls.push(args); return { code: 0, stderr: "" }; });
    try {
      await fixture.start();
      await settle();
      assert.equal(calls.filter((args) => args[0] === "kill-session").length, onTimeout === "terminate" ? 1 : 0);
      const proposed = await fixture.beforeStart();
      assert.equal(Boolean(proposed), onTimeout === "terminate");
      if (proposed) assert.match(proposed.message.content, /timed_out/);
    } finally { await fixture.stop(); }
  }
});

test("legacy running records without timeout metadata restore live workers as keep_running", async () => {
  const calls: string[][] = [];
  const legacy = runRecord({ status: "running", started: Date.now() - 600_000 });
  delete (legacy as any).deadline;
  delete (legacy as any).onTimeout;
  const fixture = lifecycle([runEntry(legacy)], async (_command, args) => { calls.push(args); return { code: 0, stderr: "" }; });
  try {
    await fixture.start();
    await settle();
    assert.equal(calls.some((args) => args[0] === "kill-session"), false, "restoring an old worker must not infer an expired terminate deadline");
    assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.onTimeout, "keep_running");
    assert.equal(fixture.entries.at(-1).data.onTimeout, "keep_running", "the conservative policy must be persisted");
  } finally { await fixture.stop(); }
});

test("legacy timed_out record without policy restores a live worker as keep_running", async () => {
  let checks = 0;
  const legacy = runRecord({ status: "timed_out" });
  delete (legacy as any).deadline;
  delete (legacy as any).onTimeout;
  const fixture = lifecycle([runEntry(legacy)], async () => { checks += 1; return { code: 0, stderr: "" }; });
  try {
    await fixture.start();
    await settle();
    assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, "running");
    assert.equal(fixture.entries[0].data.status, "timed_out", "migration must not mutate the historical snapshot");
    assert.equal(fixture.entries.at(-1).data.status, "running", "migration persists a new latest snapshot");
    assert.equal(await fixture.beforeStart(), undefined);
    assert.equal(checks >= 2, true, "the legacy worker is reconciled against tmux and monitored");
  } finally { await fixture.stop(); }
});

test("legacy timed_out record without policy reconciles a valid exit artifact", async (t) => {
  for (const [exitCode, expected] of [["0", "completed"], ["1", "failed"]]) {
    const legacy = runRecord({ status: "timed_out" });
    delete (legacy as any).deadline;
    delete (legacy as any).onTimeout;
    const fixture = lifecycle([runEntry(legacy)], async () => ({ code: 1, stderr: "" }));
    const originalRead = fs.readFile;
    const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => String(path).endsWith("exit-code") ? Promise.resolve(exitCode) : (originalRead as any)(path, ...args));
    syncBuiltinESMExports();
    try {
      await fixture.start();
      assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, expected);
      assert.equal(fixture.entries.at(-1).data.status, expected, "reconciliation persists the natural terminal state");
    } finally {
      await fixture.stop();
      mock.mock.restore();
      syncBuiltinESMExports();
    }
  }
});

test("legacy keep_running timeout status restores a live worker as monitored", async () => {
  let checks = 0;
  const fixture = lifecycle([runEntry(runRecord({ status: "timed_out", onTimeout: "keep_running", deadline: 1 }))], async () => { checks += 1; return { code: 0, stderr: "" }; });
  try {
    await fixture.start();
    await settle();
    assert.equal(checks, 2, "restoration and watcher should both inspect the still-live process");
    assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, "running");
    assert.equal(await fixture.beforeStart(), undefined, "a live keep_running worker is not a timeout completion");
  } finally { await fixture.stop(); }
});

test("restored blocking workers are monitored and their orphaned timeout is delivered", async () => {
  const calls: string[][] = [];
  const fixture = lifecycle([runEntry(runRecord({ status: "running", notifyOnCompletion: false, deadline: 1 }))], async (_command, args) => {
    calls.push(args);
    return { code: 0, stderr: "" };
  });
  try {
    await fixture.start();
    await settle();
    assert.ok(calls.some((args) => args[0] === "kill-session"), "the restored blocking worker must enforce its saved deadline");
    const proposed = await fixture.beforeStart();
    assert.match(proposed.message.content, /Subagent worker timed_out/);
  } finally { await fixture.stop(); }
});

test("restored termination intent kill failure is handled and warned", async () => {
  const fixture = lifecycle([runEntry(runRecord({ status: "running", terminationIntent: "cancelled" }))], async (_command, args) => ({ code: args[0] === "kill-session" ? 1 : 0, stderr: "permission denied" }));
  try {
    await fixture.start();
    await settle();
    assert.match(fixture.warnings[0], /Failed to terminate.*permission denied/);
    assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, "running");
    assert.equal(fixture.entries.at(-1).data.terminationIntent, undefined);
  } finally { await fixture.stop(); }
});

test("interrupted legacy migration leaves persisted snapshots untouched", async () => {
  const probe = deferred<{ code: number; stderr: string }>();
  const legacy = runRecord({ status: "timed_out" });
  delete (legacy as any).deadline;
  delete (legacy as any).onTimeout;
  const snapshot = runEntry(legacy);
  const fixture = lifecycle([snapshot], () => probe.promise);
  const starting = fixture.start();
  await settle();
  await fixture.stop();
  probe.resolve({ code: 0, stderr: "" });
  await starting;
  assert.deepEqual(snapshot.data, legacy);
  assert.equal(fixture.entries.length, 1, "an interrupted migration must not append a newer snapshot");
});

test("restoration reduces history before touching workers and never resurrects cancellation", async () => {
  const calls: string[][] = [];
  const fixture = lifecycle([runEntry(runRecord({ status: "running" })), runEntry(runRecord({ status: "cancelled" }))], async (_command, args) => { calls.push(args); return { code: 0, stderr: "" }; });
  await fixture.start();
  assert.equal(calls.length, 0);
  assert.equal(await fixture.beforeStart(), undefined);
  assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, "cancelled");
  await fixture.stop();
});

test("duplicate restored snapshots create only one watcher", async () => {
  let checks = 0;
  let running = true;
  const entry = runEntry(runRecord({ status: "running", onTimeout: "keep_running" }));
  const fixture = lifecycle([entry, structuredClone(entry)], async () => { checks += 1; return { code: running ? 0 : 1, stderr: "" }; });
  try {
    await fixture.start();
    await settle();
    assert.equal(checks, 2);
    running = false;
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.equal(checks, 3);
    assert.ok((await fixture.beforeStart()).message);
  } finally { await fixture.stop(); }
});

test("watcher rechecks generation after status I/O before enforcing timeout", async () => {
  const entered = deferred<void>();
  const checked = deferred<{ code: number; stderr: string }>();
  const calls: string[][] = [];
  let checks = 0;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", deadline: 1 }))], async (_command, args) => {
    calls.push(args);
    if (args[0] === "has-session" && ++checks === 2) { entered.resolve(); return checked.promise; }
    return { code: 0, stderr: "" };
  });
  try {
    await fixture.start();
    await entered.promise;
    await fixture.stop();
    checked.resolve({ code: 0, stderr: "" });
    await settle();
    assert.equal(calls.some((args) => args[0] === "kill-session"), false);
  } finally { checked.resolve({ code: 0, stderr: "" }); await fixture.stop(); }
});

test("in-flight status cannot overwrite cancellation", async () => {
  const entered = deferred<void>();
  const checked = deferred<{ code: number; stderr: string }>();
  let pause = false;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", notifyOnCompletion: false }))], async (_command, args) => {
    if (pause && args[0] === "has-session") { pause = false; entered.resolve(); return checked.promise; }
    return { code: 0, stderr: "" };
  });
  try {
    await fixture.start();
    pause = true;
    const refreshing = fixture.call("subagent_status", { runId: "worker" });
    await entered.promise;
    await fixture.call("subagent_cancel", { runId: "worker" });
    checked.resolve({ code: 0, stderr: "" });
    assert.equal((await refreshing).details.status, "cancelled");
  } finally { checked.resolve({ code: 0, stderr: "" }); await fixture.stop(); }
});

test("a missing tmux session during an in-flight kill cannot finalize before termination", async () => {
  const entered = deferred<void>();
  const killed = deferred<{ code: number; stderr: string }>();
  let killing = false;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", notifyOnCompletion: false }))], async (_command, args) => {
    if (args[0] === "kill-session") { killing = true; entered.resolve(); return killed.promise; }
    return { code: killing ? 1 : 0, stderr: "" };
  });
  try {
    await fixture.start();
    const cancelling = fixture.call("subagent_cancel", { runId: "worker" });
    await entered.promise;
    assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, "running");
    assert.equal(await fixture.beforeStart(), undefined);
    killed.resolve({ code: 0, stderr: "" });
    assert.equal((await cancelling).details.status, "cancelled");
  } finally { killed.resolve({ code: 0, stderr: "" }); await fixture.stop(); }
});

test("concurrent cancellation and timeout share one kill and preserve the winning terminal state", async () => {
  const entered = deferred<void>();
  const killed = deferred<{ code: number; stderr: string }>();
  let kills = 0;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", deadline: 1 }))], async (_command, args) => {
    if (args[0] === "kill-session") { kills += 1; entered.resolve(); return killed.promise; }
    return { code: 0, stderr: "" };
  });
  try {
    await fixture.start();
    await entered.promise;
    const cancelling = fixture.call("subagent_cancel", { runId: "worker" });
    await settle();
    assert.equal(kills, 1);
    killed.resolve({ code: 0, stderr: "" });
    assert.equal((await cancelling).details.status, "timed_out");
    assert.equal(await fixture.beforeStart(), undefined, "cancel suppresses the pending timeout notification");
  } finally { killed.resolve({ code: 0, stderr: "" }); await fixture.stop(); }
});

test("cancellation suppression survives interruption while timeout termination is pending", async () => {
  const entered = deferred<void>();
  const killed = deferred<{ code: number; stderr: string }>();
  const fixture = lifecycle([runEntry(runRecord({ status: "running", deadline: 1 }))], async (_command, args) => {
    if (args[0] === "kill-session") { entered.resolve(); return killed.promise; }
    return { code: 0, stderr: "" };
  });
  try {
    await fixture.start();
    await entered.promise;
    const cancelling = fixture.call("subagent_cancel", { runId: "worker" });
    assert.equal(fixture.entries.at(-1).data.completionSuppressed, true, "suppression must be persisted before cancel waits for the timeout");
    await fixture.stop();
    killed.resolve({ code: 0, stderr: "" });
    await cancelling;

    const resumed = lifecycle(structuredClone(fixture.entries), async (_command, args) => ({ code: 0, stderr: "" }));
    await resumed.start();
    await settle();
    assert.equal((await resumed.call("subagent_status", { runId: "worker" })).details.status, "timed_out", "the original timeout remains the winning terminal state");
    assert.equal((await resumed.call("subagent_status", { runId: "worker" })).details.completionSuppressed, true);
    assert.equal(await resumed.beforeStart(), undefined, "restoration must not emit the suppressed timeout");
    await resumed.stop();
  } finally { killed.resolve({ code: 0, stderr: "" }); await fixture.stop(); }
});

test("failed-kill probe cannot persist after session ownership changes", async () => {
  const entered = deferred<void>();
  const checked = deferred<{ code: number; stderr: string }>();
  let probes = 0;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", notifyOnCompletion: false }))], async (_command, args) => {
    if (args[0] === "kill-session") return { code: 1, stderr: "permission denied" };
    if (++probes === 4) { entered.resolve(); return checked.promise; }
    return { code: 0, stderr: "" };
  });
  try {
    await fixture.start();
    const cancelling = fixture.call("subagent_cancel", { runId: "worker" });
    await entered.promise;
    fixture.changeSession("other");
    const entriesBeforeProbeCompletes = fixture.entries.length;
    checked.resolve({ code: 0, stderr: "" });
    await cancelling;
    assert.equal(fixture.entries.length, entriesBeforeProbeCompletes);
    assert.equal(fixture.entries.at(-1).data.terminationIntent, "cancelled");
  } finally { checked.resolve({ code: 0, stderr: "" }); await fixture.stop(); }
});

test("a killed tmux probe is indeterminate and does not fail the worker", async () => {
  let probes = 0;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", notifyOnCompletion: false }))], async () => {
    probes += 1;
    return probes === 1 ? { code: 0, stderr: "", killed: false } : { code: 1, stderr: "", killed: true };
  });
  try {
    await fixture.start();
    await assert.rejects(fixture.call("subagent_status", { runId: "worker" }), /tmux status probe.*timed out or was killed/i);
    assert.equal(fixture.entries[0].data.status, "running");
  } finally { await fixture.stop(); }
});

test("a transient tmux probe timeout keeps the background worker monitored", async () => {
  let probes = 0;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", onTimeout: "keep_running", deadline: 1 }))], async () => {
    probes += 1;
    if (probes === 2) return { code: 1, stderr: "", killed: true };
    return { code: 0, stderr: "", killed: false };
  });
  try {
    await fixture.start();
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.ok(probes >= 3, "monitoring should retry after an indeterminate probe");
    assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, "running");
  } finally { await fixture.stop(); }
});

test("kill failure leaves the worker running and reports an error", async () => {
  const fixture = lifecycle([runEntry(runRecord({ status: "running", notifyOnCompletion: false }))], async (_command, args) => ({ code: args[0] === "kill-session" ? 1 : 0, stderr: "permission denied" }));
  await fixture.start();
  await assert.rejects(fixture.call("subagent_cancel", { runId: "worker" }), /Failed to terminate.*permission denied/);
  assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, "running");
  assert.equal(fixture.entries.at(-1).data.status, "running");
  assert.equal(fixture.entries.at(-1).data.terminationIntent, undefined);
  await fixture.stop();
});

test("background timeout kill failures are handled, warned, and not reported as stopped", async () => {
  const fixture = lifecycle([runEntry(runRecord({ status: "running", deadline: 1 }))], async (_command, args) => ({ code: args[0] === "kill-session" ? 1 : 0, stderr: "permission denied" }));
  try {
    await fixture.start();
    await settle();
    assert.match(fixture.warnings[0], /Failed to terminate/);
    assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, "running");
    assert.equal(await fixture.beforeStart(), undefined);
  } finally { await fixture.stop(); }
});

test("blocking timeout boundary returns the natural report when the worker exits", async (t) => {
  const originalNow = Date.now;
  const now = originalNow();
  let checks = 0;
  Date.now = () => now + (checks > 0 ? 30_000 : 0);
  const fixture = lifecycle([], async (_command, args) => {
    if (args[0] === "has-session") return { code: ++checks === 1 ? 0 : 1, stderr: "" };
    return { code: 0, stderr: "" };
  });
  const originalRead = fs.readFile;
  const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => {
    if (String(path).endsWith("exit-code")) return Promise.resolve("0");
    if (String(path).endsWith("events.jsonl")) return Promise.resolve('{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"natural report"}]}}');
    return (originalRead as any)(path, ...args);
  });
  syncBuiltinESMExports();
  try {
    const result = await fixture.call("subagent_run", { task: "wait", timeoutSeconds: 30 });
    assert.equal(result.content[0].text, "natural report");
    assert.equal(result.details.status, "completed");
    assert.equal(result.details.completionRetrieved, true);
    fixture.entries.push(resultEntry(result, "subagent_run"));
    assert.equal(await fixture.beforeStart(), undefined, "the blocking report result acknowledges its report");
    await fixture.stop();
    const resumed = lifecycle(structuredClone(fixture.entries));
    await resumed.start();
    assert.equal(await resumed.beforeStart(), undefined, "the persisted blocking result remains acknowledged after reload");
    await resumed.stop();
  } finally {
    Date.now = originalNow;
    await fixture.stop();
    mock.mock.restore();
    syncBuiltinESMExports();
  }
});

test("blocking timeout boundary throws the natural failure instead of returning timeout status", async (t) => {
  const originalNow = Date.now;
  const now = originalNow();
  let checks = 0;
  Date.now = () => now + (checks > 0 ? 30_000 : 0);
  const fixture = lifecycle([], async (_command, args) => {
    if (args[0] === "has-session") return { code: ++checks === 1 ? 0 : 1, stderr: "" };
    return { code: 0, stderr: "" };
  });
  const originalRead = fs.readFile;
  const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => {
    if (String(path).endsWith("exit-code")) return Promise.resolve("1");
    if (String(path).endsWith("events.jsonl")) return Promise.resolve('{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"natural failure"}]}}');
    return (originalRead as any)(path, ...args);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(fixture.call("subagent_run", { task: "wait", timeoutSeconds: 30 }), /failed: natural failure/);
  } finally {
    Date.now = originalNow;
    await fixture.stop();
    mock.mock.restore();
    syncBuiltinESMExports();
  }
});

test("blocking abort reports kill failure instead of a false timeout or cancellation", async () => {
  const fixture = lifecycle([], async (_command, args) => ({ code: args[0] === "kill-session" ? 1 : 0, stderr: "denied" }));
  await assert.rejects(fixture.call("subagent_run", { task: "wait" }, AbortSignal.abort()), /Failed to terminate/);
  assert.equal(fixture.entries.at(-1).data.status, "running");
  await fixture.stop();
});

test("blocking error recovery does not append stale state after session generation changes", async () => {
  const entered = deferred<void>();
  const probe = deferred<{ code: number; stderr: string; killed?: boolean }>();
  let probes = 0;
  const fixture = lifecycle([], async (_command, args) => {
    if (args[0] === "new-session") return { code: 0, stderr: "" };
    if (++probes === 1) { entered.resolve(); return probe.promise; }
    return { code: 0, stderr: "" };
  });
  const running = fixture.call("subagent_run", { task: "wait" });
  try {
    await entered.promise;
    fixture.changeSession("replacement");
    await fixture.start();
    const entriesAfterReplacement = fixture.entries.length;
    probe.resolve({ code: 1, stderr: "", killed: true });
    await assert.rejects(running, /tmux status probe.*timed out or was killed/);
    assert.equal(fixture.entries.length, entriesAfterReplacement, "stale recovery must not persist into the replacement session");
    assert.equal(fixture.entries.at(-1).data.notifyOnCompletion, false);
  } finally { probe.resolve({ code: 1, stderr: "", killed: true }); await running.catch(() => {}); await fixture.stop(); }
});

test("blocking status probe failure transfers the worker to notification monitoring", async () => {
  let probes = 0;
  const fixture = lifecycle([], async () => {
    probes += 1;
    return probes === 2 ? { code: 1, stderr: "", killed: true } : { code: 0, stderr: "", killed: false };
  });
  try {
    await assert.rejects(fixture.call("subagent_run", { task: "wait" }), /tmux status probe.*timed out or was killed/);
    assert.equal(fixture.entries.at(-1).data.notifyOnCompletion, true);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.ok(probes >= 3, "the worker remains monitored after the blocking call rejects");
  } finally { await fixture.stop(); }
});

test("blocking termination failure transfers the worker to notification monitoring", async () => {
  let probes = 0;
  const fixture = lifecycle([], async (_command, args) => {
    if (args[0] === "kill-session") return { code: 1, stderr: "denied" };
    probes += 1;
    return { code: 0, stderr: "", killed: false };
  });
  try {
    await assert.rejects(fixture.call("subagent_run", { task: "wait" }, AbortSignal.abort()), /Failed to terminate/);
    assert.equal(fixture.entries.at(-1).data.notifyOnCompletion, true);
    assert.equal(fixture.entries.at(-1).data.onTimeout, "terminate");
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.ok(probes >= 4, "the worker is rechecked after termination fails");
  } finally { await fixture.stop(); }
});

test("restoration probe failure does not block other workers and monitoring retries", async () => {
  const probes = new Map<string, number>();
  const fixture = lifecycle([
    runEntry(runRecord({ id: "first", tmux: "first", status: "running" })),
    runEntry(runRecord({ id: "second", tmux: "second", status: "running" })),
  ], async (_command, args) => {
    const tmux = args.at(-1)!;
    const count = (probes.get(tmux) ?? 0) + 1;
    probes.set(tmux, count);
    return tmux === "first" && count === 1
      ? { code: 1, stderr: "", killed: true }
      : { code: 0, stderr: "", killed: false };
  });
  try {
    await fixture.start();
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.ok((probes.get("first") ?? 0) >= 2, "the failed run's watcher retries its probe");
    assert.ok((probes.get("second") ?? 0) >= 2, "later restored runs are also monitored");
    assert.equal((await fixture.call("subagent_status", { runId: "first" })).details.status, "running");
  } finally { await fixture.stop(); }
});

test("a worker that exits naturally before cancellation keeps its actual exit state", async (t) => {
  let running = true;
  let kills = 0;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", notifyOnCompletion: false }))], async (_command, args) => {
    if (args[0] === "kill-session") kills += 1;
    return { code: running ? 0 : 1, stderr: "" };
  });
  await fixture.start();
  const originalRead = fs.readFile;
  const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => String(path).endsWith("exit-code") ? Promise.resolve("0") : (originalRead as any)(path, ...args));
  syncBuiltinESMExports();
  try {
    running = false;
    const result = await fixture.call("subagent_cancel", { runId: "worker" });
    assert.equal(result.details.status, "completed");
    assert.equal(kills, 0);
  } finally { await fixture.stop(); mock.mock.restore(); syncBuiltinESMExports(); }
});

test("cancel intent suppresses a naturally exited worker restored after interruption", async (t) => {
  const entered = deferred<void>();
  const killed = deferred<{ code: number; stderr: string }>();
  let running = true;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", notifyOnCompletion: false }))], async (_command, args) => {
    if (args[0] === "kill-session") { entered.resolve(); return killed.promise; }
    return { code: running ? 0 : 1, stderr: "" };
  });
  await fixture.start();
  const originalRead = fs.readFile;
  const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => String(path).endsWith("exit-code") ? Promise.resolve("0") : (originalRead as any)(path, ...args));
  syncBuiltinESMExports();
  const cancelling = fixture.call("subagent_cancel", { runId: "worker" });
  try {
    await entered.promise;
    assert.equal(fixture.entries.at(-1).data.terminationIntent, "cancelled");
    assert.equal(fixture.entries.at(-1).data.completionSuppressed, true);
    await fixture.stop();
    running = false;
    killed.resolve({ code: 1, stderr: "already exited" });
    await cancelling;
    const restored = lifecycle(structuredClone(fixture.entries), async () => ({ code: 1, stderr: "" }));
    await restored.start();
    assert.equal((await restored.call("subagent_status", { runId: "worker" })).details.status, "completed");
    assert.equal(await restored.beforeStart(), undefined);
    await restored.stop();
  } finally { killed.resolve({ code: 1, stderr: "already exited" }); await cancelling; await fixture.stop(); mock.mock.restore(); syncBuiltinESMExports(); }
});

test("successful kill intent survives shutdown and restores its terminal outcome", async () => {
  const entered = deferred<void>();
  const killed = deferred<{ code: number; stderr: string }>();
  const fixture = lifecycle([runEntry(runRecord({ status: "running", notifyOnCompletion: false }))], async (_command, args) => {
    if (args[0] === "kill-session") { entered.resolve(); return killed.promise; }
    return { code: 0, stderr: "" };
  });
  await fixture.start();
  const cancelling = fixture.call("subagent_cancel", { runId: "worker" });
  try {
    await entered.promise;
    await fixture.stop();
    killed.resolve({ code: 0, stderr: "" });
    await cancelling;
    const restored = lifecycle(structuredClone(fixture.entries), async () => ({ code: 1, stderr: "" }));
    await restored.start();
    assert.equal((await restored.call("subagent_status", { runId: "worker" })).details.status, "cancelled");
    assert.equal(await restored.beforeStart(), undefined);
    await restored.stop();
  } finally { killed.resolve({ code: 0, stderr: "" }); await cancelling; await fixture.stop(); }
});

test("restored termination intent takes precedence over an ordinary terminal refresh after a transient probe", async (t) => {
  let probes = 0;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", terminationIntent: "cancelled" }))], async () => {
    probes += 1;
    return probes === 1 ? { code: 1, stderr: "", killed: true } : { code: 1, stderr: "" };
  });
  const originalRead = fs.readFile;
  const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => String(path).endsWith("exit-code") ? Promise.resolve("") : (originalRead as any)(path, ...args));
  syncBuiltinESMExports();
  try {
    await fixture.start();
    await settle();
    assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, "cancelled");
  } finally { await fixture.stop(); mock.mock.restore(); syncBuiltinESMExports(); }
});

test("termination intent remains authoritative after a retry probe reports a missing session", async (t) => {
  let probes = 0;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", terminationIntent: "cancelled" }))], async (_command, args) => {
    if (args[0] === "kill-session") return { code: 1, stderr: "not found" };
    return { code: ++probes === 1 ? 0 : 1, stderr: "" };
  });
  const originalRead = fs.readFile;
  const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => String(path).endsWith("exit-code") ? Promise.resolve("") : (originalRead as any)(path, ...args));
  syncBuiltinESMExports();
  try {
    await fixture.start();
    await settle();
    assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, "cancelled");
  } finally { await fixture.stop(); mock.mock.restore(); syncBuiltinESMExports(); }
});

test("reload before tmux exists keeps a delayed launch monitored without stale continuation", { timeout: 5_000 }, async () => {
  const launch = deferred<{ code: number; stderr: string }>();
  let live = false;
  let kills = 0;
  const fixture = lifecycle([], async (_command, args) => {
    if (args[0] === "new-session") return launch.promise;
    if (args[0] === "kill-session") { kills += 1; live = false; return { code: 0, stderr: "" }; }
    return { code: live ? 0 : 1, stderr: "" };
  });
  const starting = fixture.call("subagent_run", { task: "inspect", mode: "background" });
  try {
    for (let attempt = 0; attempt < 20 && fixture.entries.length === 0; attempt++) await settle();
    assert.equal(fixture.entries.length, 1, "launch metadata must persist before tmux spawn resolves");
    assert.equal(fixture.entries[0].data.status, "launching");
    // Expire the policy before reload; absence is not proof that this launch has finished.
    fixture.entries[0].data.deadline = 1;
    const runId = fixture.entries[0].data.id;
    await fixture.stop();
    await fixture.start();
    await settle();
    assert.equal((await fixture.call("subagent_status", { runId })).details.status, "launching");
    assert.equal(await fixture.beforeStart(), undefined, "a pending spawn must not generate a failure report");
    assert.equal(kills, 0);
    const entriesAfterReload = fixture.entries.length;
    live = true;
    launch.resolve({ code: 0, stderr: "" });
    await assert.rejects(starting, /session changed|shutdown/i);
    assert.equal(fixture.entries.length, entriesAfterReload, "stale launch continuation must not append session entries");
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.equal(kills, 1, "the restored watcher must enforce the original deadline when the worker appears");
    assert.equal((await fixture.call("subagent_status", { runId })).details.status, "timed_out");
  } finally { launch.resolve({ code: 0, stderr: "" }); await starting.catch(() => {}); await fixture.stop(); }
});

test("a missing-session probe started before spawn cannot fail a newly running worker", { timeout: 5_000 }, async () => {
  const launch = deferred<{ code: number; stderr: string }>();
  const entered = deferred<void>();
  const probe = deferred<{ code: number; stderr: string }>();
  let live = false;
  const fixture = lifecycle([], async (_command, args) => {
    if (args[0] === "new-session") return launch.promise;
    if (!live) { entered.resolve(); return probe.promise; }
    return { code: 0, stderr: "" };
  });
  const starting = fixture.call("subagent_run", { task: "inspect", mode: "background" });
  let refreshing: Promise<any> | undefined;
  try {
    for (let attempt = 0; attempt < 20 && fixture.entries.length === 0; attempt++) await settle();
    const runId = fixture.entries[0].data.id;
    refreshing = fixture.call("subagent_status", { runId });
    await entered.promise;
    live = true;
    launch.resolve({ code: 0, stderr: "" });
    await starting;
    probe.resolve({ code: 1, stderr: "" });
    assert.equal((await refreshing).details.status, "running");
    assert.equal(await fixture.beforeStart(), undefined);
  } finally {
    launch.resolve({ code: 0, stderr: "" });
    probe.resolve({ code: 1, stderr: "" });
    await starting.catch(() => {});
    await refreshing;
    await fixture.stop();
  }
});

test("a restored launch reconciles durable spawn failure or a fast natural exit", { timeout: 5_000 }, async () => {
  for (const failed of [true, false]) {
    const launch = deferred<{ code: number; stderr: string }>();
    const fixture = lifecycle([], async (_command, args) => args[0] === "new-session" ? launch.promise : ({ code: 1, stderr: "" }));
    const starting = fixture.call("subagent_run", { task: "inspect", mode: "background" });
    try {
      for (let attempt = 0; attempt < 20 && fixture.entries.length === 0; attempt++) await settle();
      assert.equal(fixture.entries[0].data.status, "launching");
      const { id: runId, dir } = fixture.entries[0].data;
      await fixture.stop();
      await fixture.start();
      assert.equal(await fixture.beforeStart(), undefined);
      if (!failed) await fs.writeFile(`${dir}/exit-code`, "0");
      launch.resolve({ code: failed ? 1 : 0, stderr: failed ? "spawn denied" : "" });
      await assert.rejects(starting, failed ? /spawn denied/ : /shutdown|reload/i);
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      assert.equal((await fixture.call("subagent_status", { runId })).details.status, failed ? "failed" : "completed");
      assert.equal(fixture.entries.at(-1).data.status, failed ? "failed" : "completed");
      assert.ok((await fixture.beforeStart()).message, "the reconciled outcome remains deliverable");
    } finally { launch.resolve({ code: 0, stderr: "" }); await starting.catch(() => {}); await fixture.stop(); }
  }
});

test("cancellation during a gated launch durably prevents the delayed wrapper after reload", { timeout: 5_000 }, async () => {
  const entered = deferred<void>();
  const launch = deferred<void>();
  let env: NodeJS.ProcessEnv;
  let kills = 0;
  const fixture = lifecycle([], async (_command, args) => {
    if (args[0] === "new-session") {
      entered.resolve();
      await launch.promise;
      execFileSync("/bin/sh", [args.at(-1)!], { env, timeout: 1_000 });
      return { code: 0, stderr: "" };
    }
    if (args[0] === "kill-session") kills += 1;
    return { code: 1, stderr: "" };
  });
  const starting = fixture.call("subagent_run", { task: "inspect", mode: "background" });
  try {
    await entered.promise;
    const { id: runId, dir } = fixture.entries[0].data;
    await fs.mkdir(`${dir}/bin`);
    await fs.writeFile(`${dir}/bin/pi`, `#!/bin/sh\nprintf invoked > '${dir}/invoked'\n`, { mode: 0o700 });
    env = { ...process.env, PATH: `${dir}/bin:${process.env.PATH}` };
    assert.equal((await fixture.call("subagent_cancel", { runId })).details.status, "cancelled");
    assert.equal(fixture.entries.at(-1).data.terminationIntent, undefined);
    await fixture.stop();
    await fixture.start();
    assert.equal((await fixture.call("subagent_status", { runId })).details.status, "cancelled");
    const count = fixture.entries.length;
    launch.resolve();
    await assert.rejects(starting, /shutdown|reload/i);
    assert.equal(fixture.entries.length, count, "stale launch acknowledgement must not persist state");
    await assert.rejects(fs.readFile(`${dir}/invoked`), { code: "ENOENT" });
    assert.equal(kills, 0, "the admission fence cancels even while tmux does not exist");
    assert.equal(await fixture.beforeStart(), undefined);
  } finally { launch.resolve(); await starting.catch(() => {}); await fixture.stop(); }
});

test("concurrent refreshes and restoration preserve the first terminal outcome after exit-artifact reads", { timeout: 5_000 }, async (t) => {
  for (const intent of ["cancelled", "timed_out"]) {
    for (const [exitCode, expected] of [["", intent], ["0", "completed"], ["1", "failed"]]) {
      const entered = [deferred<void>(), deferred<void>(), deferred<void>()];
      const artifacts = [deferred<string>(), deferred<string>(), deferred<string>()];
      let reads = 0;
      const fixture = lifecycle([runEntry(runRecord({ status: "running", terminationIntent: intent, onTimeout: "keep_running" }))]);
      const originalRead = fs.readFile;
      const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => {
        if (String(path).endsWith("exit-code") && reads < artifacts.length) {
          const index = reads++;
          entered[index].resolve();
          return artifacts[index].promise;
        }
        return (originalRead as any)(path, ...args);
      });
      syncBuiltinESMExports();
      const starting = fixture.start();
      const pending: Promise<any>[] = [starting];
      try {
        await entered[0].promise;
        const first = fixture.call("subagent_status", { runId: "worker" });
        pending.push(first);
        await entered[1].promise;
        const second = fixture.call("subagent_status", { runId: "worker" });
        pending.push(second);
        await entered[2].promise;
        artifacts[1].resolve(exitCode);
        assert.equal((await first).details.status, expected);
        // Later readers have stale/missing artifacts and an intent which the winner has cleared.
        artifacts[2].resolve("");
        assert.equal((await second).details.status, expected);
        artifacts[0].resolve("");
        await starting;
        assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, expected);
        assert.equal(fixture.entries.at(-1).data.status, expected);
        assert.equal(fixture.entries.at(-1).data.terminationIntent, undefined);
      } finally {
        for (const artifact of artifacts) artifact.resolve("");
        await Promise.allSettled(pending);
        await fixture.stop();
        mock.mock.restore();
        syncBuiltinESMExports();
      }
    }
  }
});

test("restored termination intent retries after a transient restore probe failure", async () => {
  let probes = 0;
  let kills = 0;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", terminationIntent: "cancelled" }))], async (_command, args) => {
    if (args[0] === "kill-session") { kills += 1; return { code: 0, stderr: "" }; }
    probes += 1;
    if (probes === 1) return { code: 1, stderr: "", killed: true };
    return { code: 0, stderr: "" };
  });
  try {
    await fixture.start();
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.equal(kills, 1, "the watcher must retry the persisted cancellation intent");
    assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, "cancelled");
  } finally { await fixture.stop(); }
});

test("restoration honors a valid natural exit artifact over persisted termination intent", async (t) => {
  const fixture = lifecycle([runEntry(runRecord({ status: "running", terminationIntent: "cancelled" }))], async () => ({ code: 1, stderr: "" }));
  const originalRead = fs.readFile;
  const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => String(path).endsWith("exit-code") ? Promise.resolve("0") : (originalRead as any)(path, ...args));
  syncBuiltinESMExports();
  try {
    await fixture.start();
    assert.equal((await fixture.call("subagent_status", { runId: "worker" })).details.status, "completed");
  } finally { await fixture.stop(); mock.mock.restore(); syncBuiltinESMExports(); }
});

test("failed kill honors a natural exit artifact when the session disappears", async (t) => {
  let probes = 0;
  const fixture = lifecycle([runEntry(runRecord({ status: "running", notifyOnCompletion: false }))], async (_command, args) => {
    if (args[0] === "kill-session") return { code: 1, stderr: "session already exited" };
    return { code: ++probes === 1 ? 0 : 1, stderr: "" };
  });
  const originalRead = fs.readFile;
  const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => String(path).endsWith("exit-code") ? Promise.resolve("1") : (originalRead as any)(path, ...args));
  syncBuiltinESMExports();
  try {
    await fixture.start();
    const result = await fixture.call("subagent_cancel", { runId: "worker" });
    assert.equal(result.details.status, "failed", "the worker's natural failure must take precedence over cancellation");
  } finally { await fixture.stop(); mock.mock.restore(); syncBuiltinESMExports(); }
});

test("completion probe failure does not prevent reports for other workers", async (t) => {
  const probes = new Map<string, number>();
  const fixture = lifecycle([
    runEntry(runRecord({ id: "first", tmux: "first", status: "running" })),
    runEntry(runRecord({ id: "second", tmux: "second", status: "completed" })),
  ], async (_command, args) => {
    const tmux = args.at(-1)!;
    probes.set(tmux, (probes.get(tmux) ?? 0) + 1);
    return { code: 1, stderr: "", killed: tmux === "first" };
  });
  try {
    await fixture.start();
    const originalRead = fs.readFile;
    const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => String(path).endsWith("events.jsonl") ? Promise.resolve("") : (originalRead as any)(path, ...args));
    syncBuiltinESMExports();
    try {
      const proposal = await fixture.beforeStart();
      assert.deepEqual(proposal.message.details.runIds, ["second"]);
    } finally { mock.mock.restore(); syncBuiltinESMExports(); }
  } finally { await fixture.stop(); }
});

/** Exercises the generated wrapper with a harmless executable after an inconclusive launch expires. */
test("an unacknowledged launch expires durably and a delayed wrapper cannot start Pi", { timeout: 5_000 }, async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  const fixture = lifecycle([], async (_command, args) => args[0] === "new-session"
    ? { code: 1, stderr: "", killed: true }
    : { code: 1, stderr: "" });
  try {
    await assert.rejects(fixture.call("subagent_run", { task: "inspect", mode: "background", onTimeout: "keep_running" }), /launch timed out/i);
    const { id, dir } = fixture.entries[0].data;
    assert.equal((await fixture.call("subagent_status", { runId: id })).details.status, "launching");
    now += 31_000;
    assert.equal((await fixture.call("subagent_status", { runId: id })).details.status, "timed_out");
    await fixture.stop();
    const restored = lifecycle(structuredClone(fixture.entries));
    try {
      await restored.start();
      assert.equal((await restored.call("subagent_status", { runId: id })).details.status, "timed_out");
      await fs.mkdir(`${dir}/bin`);
      await fs.writeFile(`${dir}/bin/pi`, `#!/bin/sh\nprintf invoked > '${dir}/invoked'\n`, { mode: 0o700 });
      execFileSync("/bin/sh", [`${dir}/run.sh`], { env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}` }, timeout: 1_000 });
      await assert.rejects(fs.readFile(`${dir}/invoked`), { code: "ENOENT" });
    } finally { await restored.stop(); }
  } finally { Date.now = originalNow; await fixture.stop(); }
});

/** Runs the wrapper after its absolute admission deadline while no parent watcher is alive. */
test("the wrapper rejects an expired launch while Pi is stopped and restoration finalizes timeout", { timeout: 5_000 }, async () => {
  const originalNow = Date.now;
  Date.now = () => originalNow() - 60_000;
  const fixture = lifecycle([], async (_command, args) => args[0] === "new-session"
    ? { code: 1, stderr: "", killed: true }
    : { code: 1, stderr: "" });
  let restored: ReturnType<typeof lifecycle> | undefined;
  try {
    await assert.rejects(fixture.call("subagent_run", { task: "inspect", mode: "background", onTimeout: "keep_running" }), /launch timed out/i);
    const { id, dir } = fixture.entries[0].data;
    await fixture.stop();
    Date.now = originalNow;
    await fs.mkdir(`${dir}/bin`);
    await fs.writeFile(`${dir}/bin/pi`, `#!/bin/sh\nprintf invoked > '${dir}/invoked'\n`, { mode: 0o700 });
    execFileSync("/bin/sh", [`${dir}/run.sh`], { env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}` }, timeout: 1_000 });
    await assert.rejects(fs.readFile(`${dir}/invoked`), { code: "ENOENT" });
    restored = lifecycle(structuredClone(fixture.entries));
    await restored.start();
    assert.equal((await restored.call("subagent_status", { runId: id })).details.status, "timed_out");
    assert.equal(restored.entries.at(-1).data.status, "timed_out");
  } finally { Date.now = originalNow; await fixture.stop(); await restored?.stop(); }
});

/** Gates actual artifact reads or a tmux probe across each session ownership boundary. */
test("stale launch refresh cannot mutate or persist after gated I/O loses ownership", { timeout: 5_000 }, async (t) => {
  for (const boundary of ["launch-state", "probe", "exit-code"]) {
    for (const transition of ["shutdown", "generation", "session"]) {
      const entered = deferred<void>();
      const release = deferred<void>();
      let pause = false;
      const dir = await fs.mkdtemp("/tmp/pi-subagent-test-");
      const fixture = lifecycle([runEntry(runRecord({ dir, status: "launching", deadline: Date.now() + 300_000 }))], async () => {
        if (pause && boundary === "probe") { pause = false; entered.resolve(); await release.promise; return { code: 0, stderr: "" }; }
        return { code: 1, stderr: "" };
      });
      const originalRead = fs.readFile;
      const mock = t.mock.method(fs, "readFile", (path: any, ...args: any[]) => {
        if (pause && String(path).endsWith(boundary)) {
          pause = false;
          const snapshot = (originalRead as any)(path, ...args).catch(() => "");
          entered.resolve();
          return release.promise.then(() => snapshot);
        }
        return (originalRead as any)(path, ...args);
      });
      syncBuiltinESMExports();
      let refreshing: Promise<any> | undefined;
      try {
        await fixture.start();
        const previous = (await fixture.call("subagent_status", { runId: "worker" })).details;
        if (boundary === "exit-code") await fs.writeFile(`${dir}/exit-code`, "0");
        pause = true;
        refreshing = fixture.call("subagent_status", { runId: "worker" });
        await entered.promise;
        if (transition === "shutdown") await fixture.stop();
        if (transition === "generation") { fixture.entries.length = 0; await fixture.start(); }
        if (transition === "session") fixture.changeSession("replacement");
        const count = fixture.entries.length;
        release.resolve();
        await assert.rejects(refreshing, /ownership|abandoned/i);
        assert.equal(previous.status, "launching", `${boundary}/${transition}: detached state must not mutate`);
        assert.equal(fixture.entries.length, count, `${boundary}/${transition}: stale refresh must not persist`);
      } finally {
        release.resolve();
        await refreshing?.catch(() => {});
        await fixture.stop();
        mock.mock.restore();
        syncBuiltinESMExports();
      }
    }
  }
});

test("an in-flight kill cannot append state after shutdown or generation replacement", async () => {
  for (const transition of ["shutdown", "generation"]) {
    const entered = deferred<void>();
    const killed = deferred<{ code: number; stderr: string }>();
    const fixture = lifecycle([runEntry(runRecord({ status: "running", notifyOnCompletion: false }))], async (_command, args) => {
      if (args[0] === "kill-session") { entered.resolve(); return killed.promise; }
      return { code: 0, stderr: "" };
    });
    await fixture.start();
    const cancelling = fixture.call("subagent_cancel", { runId: "worker" });
    try {
      await entered.promise;
      if (transition === "shutdown") await fixture.stop();
      else { fixture.entries.length = 0; await fixture.start(); }
      const count = fixture.entries.length;
      killed.resolve({ code: 0, stderr: "" });
      await cancelling;
      assert.equal(fixture.entries.length, count);
    } finally { killed.resolve({ code: 0, stderr: "" }); await cancelling; await fixture.stop(); }
  }
});
