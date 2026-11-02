import assert from "node:assert/strict";
import test from "node:test";
import selfCheckExtension from "../extensions/self-check.ts";
import goalExtension from "../extensions/goal.ts";

type Harness = {
  events: Map<string, (...args: any[]) => Promise<any>>;
  commands: Map<string, { handler: (...args: any[]) => Promise<void> }>;
  tool: { options: any; execute: (...args: any[]) => Promise<any> } | null;
  entries: any[];
  seeded: any[];
  notifications: { message: string; level?: string }[];
  statuses: Map<string, string | undefined>;
  context: any;
};

function setup(loadGoalToo = false, goalFirst = false): Harness {
  const harness: Harness = {
    events: new Map(),
    commands: new Map(),
    tool: null,
    entries: [],
    seeded: [],
    notifications: [],
    statuses: new Map(),
    context: null,
  };
  harness.context = {
    sessionManager: {
      getBranch: () => [
        ...harness.seeded.map((entry, index) => ({ id: `seed-${index}`, type: "custom", customType: entry.customType, data: entry.data })),
        ...harness.entries.map((entry, index) => ({ id: String(index), type: "custom", customType: entry.customType, data: entry.data })),
      ],
    },
    hasUI: true,
    ui: {
      notify: (message: string, level?: string) => harness.notifications.push({ message, level }),
      setStatus: (key: string, value: string | undefined) => harness.statuses.set(key, value),
    },
  };
  const api: any = {
    on: (event: string, handler: (...args: any[]) => Promise<any>) => harness.events.set(event, handler),
    registerCommand: (name: string, options: { handler: (...args: any[]) => Promise<void> }) => harness.commands.set(name, options),
    registerTool: (options: any) => { harness.tool = { options, execute: options.execute }; },
    appendEntry: (customType: string, data: unknown) => harness.entries.push({ customType, data }),
  };
  selfCheckExtension(api);
  if (loadGoalToo) {
    // Chain both extensions' handlers in the requested registration order.
    // Returning undefined preserves the earlier handler's boundary decision, as in Pi.
    const register = (event: string, handler: any) => {
      const existing = harness.events.get(event);
      harness.events.set(event, async (...args: any[]) => {
        const prior = existing ? await existing(...args) : undefined;
        const result = await handler(...args);
        return result ?? prior;
      });
    };
    const goalApi: any = { ...api, on: register };
    if (goalFirst) {
      // Rebuild so goal's handler runs first: re-register self-check onto a fresh map first.
      const selfCheckHandlers = new Map(harness.events);
      harness.events.clear();
      goalExtension({ ...api, on: (event: string, handler: any) => harness.events.set(event, handler) } as any);
      for (const [event, handler] of selfCheckHandlers) register(event, handler);
    } else {
      goalExtension(goalApi);
    }
  }
  return harness;
}

const settle = (harness: Harness, event: any) => harness.events.get("agent_before_settle")!(event, harness.context);

const userTurn = (text: string) => ({
  entries: [],
  context: {
    llmMessages: [{ role: "assistant", content: text }],
    contextEntries: [{ sourceEntry: { type: "message", message: { role: "user" } }, messages: [{ role: "user" }] }],
  },
});

const checkResponse = (text: string, toolCalls: any[] = []) => ({
  entries: [],
  context: {
    llmMessages: [
      { role: "user", content: "Self-check verification" },
      { role: "assistant", content: [{ type: "text", text }], toolCalls },
    ],
    contextEntries: [
      { sourceEntry: { type: "message", message: { role: "user" } }, messages: [{ role: "user" }] },
      { sourceEntry: { type: "custom_message", customType: "self-check-check" }, messages: [{ role: "custom" }] },
    ],
  },
});

const arm = async (h: Harness, check = "tests pass", ctx = h.context) =>
  h.tool!.execute("t1", { action: "set", check }, undefined, undefined, ctx);

const call = async (h: Harness, params: any) => h.tool!.execute("t1", params, undefined, undefined, h.context);

test("agent arms a check through the self_check tool; first settlement injects a verification continuation", async () => {
  const h = setup();
  const armed = await arm(h, "lint and tests pass");
  assert.match(armed.content[0].text, /armed/);
  assert.equal(h.entries.at(-1).data.check, "lint and tests pass");
  assert.equal(h.entries.at(-1).data.iterations, 0);
  assert.equal(h.entries.at(-1).data.phase, "armed");

  const result = await settle(h, userTurn("implemented the feature"));
  assert.equal(result.continue, true);
  const injected = result.entries.at(-1);
  assert.equal(injected.type, "custom_message");
  assert.equal(injected.customType, "self-check-check");
  assert.match(injected.content, /lint and tests pass/);
  assert.match(injected.content, /action=pass/);
  assert.equal(h.entries.at(-1).data.iterations, 1);
  assert.equal(h.entries.at(-1).data.phase, "verifying");
  assert.match(h.statuses.get("self-check")!, /\(1\/3\)/);
});

test("a valid pass with evidence disarms the check and lets the agent produce a final response", async () => {
  const h = setup();
  await arm(h, "tests pass");

  // Early pass before any verification continuation is rejected.
  const earlyPass = await call(h, { action: "pass", evidence: "assumed done" });
  assert.match(earlyPass.content[0].text, /only valid after the gate triggered verification/);
  assert.equal(h.entries.at(-1).data.phase, "armed");

  await settle(h, userTurn("working"));

  const pass = await call(h, { action: "pass", evidence: "npm test: 12 passing" });
  assert.match(pass.content[0].text, /passed and disarmed/);
  assert.equal(h.entries.at(-1).data.check, null);
  assert.equal(h.entries.at(-1).data.phase, "passed");
  assert.equal(h.entries.at(-1).data.note, "npm test: 12 passing");
  assert.equal(h.statuses.get("self-check"), undefined);

  // Normal final response: no further continuation.
  assert.equal(await settle(h, userTurn("final summary")), undefined);
});

test("pass without evidence is rejected; pass with no check armed is rejected", async () => {
  const h = setup();
  const none = await call(h, { action: "pass", evidence: "nothing armed" });
  assert.match(none.content[0].text, /No self-check is armed/);

  await arm(h, "tests pass");
  await settle(h, userTurn("working"));
  const missing = await call(h, { action: "pass" });
  assert.match(missing.content[0].text, /requires `evidence`/);
  assert.equal(h.entries.at(-1).data.phase, "verifying");
});

test("fail records the failure, disarms, and allows a normal final response", async () => {
  const h = setup();
  await arm(h, "tests pass");
  await settle(h, userTurn("working"));

  const fail = await call(h, { action: "fail", reason: "spec is ambiguous" });
  assert.match(fail.content[0].text, /failure recorded/);
  assert.equal(h.entries.at(-1).data.phase, "failed");
  assert.equal(h.entries.at(-1).data.note, "spec is ambiguous");
  const failure = h.notifications.find((n) => n.level === "warning");
  assert.match(failure!.message, /Self-check failed/);
  assert.equal(await settle(h, userTurn("explaining failure")), undefined);
});

test("a failed verification continues the loop while budget remains", async () => {
  const h = setup();
  await arm(h, "tests pass");
  await settle(h, userTurn("working"));
  // Agent responded to the check without passing: another continuation.
  const result = await settle(h, checkResponse("still fixing"));
  assert.equal(result.continue, true);
  assert.equal(h.entries.at(-1).data.iterations, 2);
});

test("exactly three continuations are allowed; exhaustion records failure and terminates", async () => {
  const h = setup();
  await arm(h, "tests pass");
  assert.equal((await settle(h, userTurn("started"))).continue, true);
  assert.equal((await settle(h, checkResponse("nope"))).continue, true);
  assert.equal((await settle(h, checkResponse("nope"))).continue, true);
  // Third continuation already used; the next check response must not continue.
  const last = await settle(h, checkResponse("nope"));
  assert.equal(last, undefined);
  const finalEntry = h.entries.at(-1).data;
  assert.equal(finalEntry.check, null);
  assert.equal(finalEntry.phase, "exhausted");
  assert.match(h.notifications.at(-1)!.message, /NOT successful/);
  assert.equal(h.notifications.at(-1)!.level, "error");
  // No infinite loop: further settles do nothing.
  assert.equal(await settle(h, userTurn("anything")), undefined);
});

test("reloading preserves the remaining iteration budget; terminal states do not resume", async () => {
  const h = setup();
  await arm(h, "tests pass");
  await settle(h, userTurn("started")); // 1 continuation used
  await settle(h, checkResponse("nope")); // 2 used

  // Simulate reload: fresh extension state, branch history intact.
  const h2 = setup();
  h2.seeded.push(...h.entries);
  await h2.events.get("session_start")!({}, h2.context);
  assert.match(h2.statuses.get("self-check")!, /\(2\/3\)/);
  assert.equal((await settle(h2, userTurn("more work"))).continue, true);
  assert.equal(h2.entries.at(-1).data.iterations, 3);
  // Only one continuation left after reload.
  assert.equal(await settle(h2, checkResponse("nope")), undefined);
  assert.equal(h2.entries.at(-1).data.phase, "exhausted");

  // A terminal (passed) state must not resume verification.
  const h3 = setup();
  h3.seeded.push({ customType: "self-check-state", data: { check: null, iterations: 2, phase: "passed", note: "done" } });
  await h3.events.get("session_start")!({}, h3.context);
  assert.equal(h3.statuses.get("self-check"), undefined);
  assert.equal(await settle(h3, userTurn("new turn")), undefined);
});

test("/tree navigation restores the state of the active branch", async () => {
  const h = setup();
  await arm(h, "tests pass");
  await settle(h, userTurn("started"));

  // Navigate to an older branch point before the check was armed.
  h.entries = [];
  await h.events.get("session_tree")!({ newLeafId: "old" }, h.context);
  assert.equal(h.statuses.get("self-check"), undefined);
  assert.equal(await settle(h, userTurn("older work")), undefined);

  // Navigate forward again: the armed state comes back with its budget.
  await arm(h, "tests pass");
  await settle(h, userTurn("started"));
  await h.events.get("session_tree")!({ newLeafId: "new" }, h.context);
  assert.match(h.statuses.get("self-check")!, /\(1\/3\)/);
  assert.equal((await settle(h, userTurn("resumed"))).continue, true);
});

test("a repeated identical set is rejected and never resets the attempt counter", async () => {
  const h = setup();
  await arm(h, "tests pass");
  await settle(h, userTurn("started")); // iterations 1
  await settle(h, checkResponse("nope")); // iterations 2

  const repeat = await arm(h, "tests pass");
  assert.ok(!repeat.content[0].text.match(/armed \(max/));
  assert.match(repeat.content[0].text, /not reset/);
  assert.equal(h.entries.at(-1).data.iterations, 2);
  assert.equal(h.entries.at(-1).data.phase, "verifying");

  // Only one continuation remains: 3 total, never reset to a fresh budget.
  assert.equal((await settle(h, checkResponse("nope"))).continue, true);
  assert.equal(await settle(h, checkResponse("nope")), undefined);
});

test("arming a different check requires explicit replace=true and keeps the budget", async () => {
  const h = setup();
  await arm(h, "tests pass");
  await settle(h, userTurn("started")); // iterations 1

  const rejected = await arm(h, "build succeeds");
  assert.match(rejected.content[0].text, /replace=true/);
  assert.equal(h.entries.at(-1).data.check, "tests pass");
  assert.equal(h.entries.at(-1).data.iterations, 1);

  const replaced = await h.tool!.execute("t1", { action: "set", check: "build succeeds", replace: true }, undefined, undefined, h.context);
  assert.match(replaced.content[0].text, /replaced/);
  assert.match(replaced.content[0].text, /preserved/);
  assert.equal(h.entries.at(-1).data.check, "build succeeds");
  assert.equal(h.entries.at(-1).data.iterations, 1);
});

test("manual clearing works via command and tool", async () => {
  const h = setup();
  await h.commands.get("self-check")!.handler("tests pass", h.context);
  await h.commands.get("self-check")!.handler("off", h.context);
  assert.equal(h.entries.at(-1).data.phase, "cleared");
  assert.equal(await settle(h, userTurn("work")), undefined);

  await arm(h, "tests pass");
  const cleared = await call(h, { action: "clear" });
  assert.match(cleared.content[0].text, /disarmed/);
  assert.equal(h.entries.at(-1).data.phase, "cleared");
  assert.equal(await settle(h, userTurn("work")), undefined);
});

test("status reports state; set without a check is rejected", async () => {
  const h = setup();
  const status = await call(h, { action: "status" });
  assert.match(status.content[0].text, /No self-check armed/);

  const missing = await call(h, { action: "set" });
  assert.match(missing.content[0].text, /requires a `check`/);

  await arm(h, "tests pass");
  const armed = await call(h, { action: "status" });
  assert.match(armed.content[0].text, /tests pass/);
});

test("reload restores an in-progress verification so the agent can pass immediately", async () => {
  const h = setup();
  h.seeded.push({ customType: "self-check-state", data: { check: "tests pass", iterations: 2, phase: "verifying" } });
  await h.events.get("session_start")!({}, h.context);
  assert.match(h.statuses.get("self-check")!, /\(2\/3\)/);

  const pass = await call(h, { action: "pass", evidence: "suite green after reload" });
  assert.match(pass.content[0].text, /passed and disarmed/);
  assert.equal(h.entries.at(-1).data.phase, "passed");
});

test("restored terminal state keeps its outcome visible in status without reactivating", async () => {
  const h = setup();
  h.seeded.push({ customType: "self-check-state", data: { check: null, iterations: 3, phase: "exhausted", note: "flaky suite" } });
  await h.events.get("session_start")!({}, h.context);
  assert.equal(h.statuses.get("self-check"), undefined);
  assert.equal(await settle(h, userTurn("new turn")), undefined);

  const status = await call(h, { action: "status" });
  assert.match(status.content[0].text, /last outcome: exhausted: flaky suite/);
});

test("the limit is unconditional: a new user turn cannot push past three continuations", async () => {
  const h = setup();
  await arm(h, "tests pass");
  assert.equal((await settle(h, userTurn("started"))).continue, true);
  assert.equal((await settle(h, userTurn("more user work"))).continue, true);
  assert.equal((await settle(h, checkResponse("nope"))).continue, true);
  assert.equal(h.entries.at(-1).data.iterations, 3);

  // Fourth settlement of any kind: exhausted, never a fourth continuation.
  const last = await settle(h, userTurn("even more user work"));
  assert.equal(last, undefined);
  assert.equal(h.entries.at(-1).data.phase, "exhausted");
});

test("the final verification attempt instructs the agent to report remaining failures", async () => {
  const h = setup();
  await arm(h, "tests pass");
  await settle(h, userTurn("started"));
  await settle(h, checkResponse("nope"));
  const result = await settle(h, checkResponse("nope"));
  assert.equal(result.continue, true);
  assert.match(result.entries.at(-1).content, /final verification attempt/);
  assert.match(result.entries.at(-1).content, /explain the remaining failure/);
});

for (const goalFirst of [false, true]) {
  test(`an active /goal cancels an armed check regardless of registration order (goal first: ${goalFirst})`, async () => {
    const h = setup(true, goalFirst);
    await arm(h, "tests pass");
    await h.commands.get("goal")!.handler("ship it", h.context);
    const result = await settle(h, userTurn("working"));
    assert.match(h.notifications.at(-1)!.message, /cancelled .*\/goal/);
    assert.equal(h.entries.at(-1).data.phase, "cancelled-goal");
    // The goal loop still owns the boundary; its continuation decision survives.
    assert.equal(result.continue, true);
  });
}

test("an active /goal blocks arming, and a goal becoming active disarms an armed check", async () => {
  const h = setup(true);
  await h.commands.get("goal")!.handler("ship it", h.context);
  const refused = await arm(h, "tests pass");
  assert.match(refused.content[0].text, /\/goal is active/);
  assert.equal(h.entries.filter((e) => e.customType === "self-check-state").length, 0);
  assert.equal(h.entries.filter((e) => e.customType === "self-check-state").length, 0);

  // Arm first, then activate the goal mid-run: self-check disarms and defers.
  const h2 = setup(true);
  await arm(h2, "tests pass");
  await h2.commands.get("goal")!.handler("ship it", h2.context);
  const result = await settle(h2, userTurn("working"));
  assert.match(h2.notifications.at(-1)!.message, /cancelled .*\/goal/);
  assert.equal(h2.entries.at(-1).data.phase, "cancelled-goal");
  // The goal loop still owns the boundary: its continuation decision is preserved.
  assert.equal(result.continue, true);
  // Self-check never resumes automatically after the goal completes.
  await h2.commands.get("ungoal")!.handler("", h2.context);
  assert.equal(h2.statuses.get("self-check"), undefined);
  assert.equal(await settle(h2, userTurn("done with goal")), undefined);
});

test("boundary entries from other extensions are preserved when self-check continues", async () => {
  const h = setup();
  await arm(h, "tests pass");
  const other = { type: "custom_message" as const, customType: "other-extension", content: "note", display: false };
  const result = await settle(h, { ...userTurn("working"), entries: [other] });
  assert.equal(result.continue, true);
  assert.ok(result.entries.includes(other));
  assert.equal(result.entries.length, 2);
});
