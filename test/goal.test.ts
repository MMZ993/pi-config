import assert from "node:assert/strict";
import test from "node:test";
import goalExtension from "../extensions/goal.ts";

test("goal commands persist, show, and disable a session goal; settlement requests a goal check", async () => {
  const events = new Map<string, (...args: any[]) => Promise<any>>();
  const commands = new Map<string, { handler: (...args: any[]) => Promise<void> }>();
  const entries: any[] = [];
  const notifications: string[] = [];
  const statuses = new Map<string, string | undefined>();
  goalExtension({
    on: (event: string, handler: (...args: any[]) => Promise<any>) => events.set(event, handler),
    registerCommand: (name: string, options: { handler: (...args: any[]) => Promise<void> }) => commands.set(name, options),
    appendEntry: (customType: string, data: unknown) => entries.push({ customType, data }),
  } as any);

  const context = {
    sessionManager: { getBranch: () => entries.map((entry, index) => ({ id: String(index), type: "custom", customType: entry.customType, data: entry.data })) },
    ui: {
      notify: (message: string) => notifications.push(message),
      setStatus: (key: string, value: string | undefined) => statuses.set(key, value),
    },
  };

  await commands.get("goal")!.handler("Finish the implementation", context as any);
  assert.equal(entries.at(-1).data.goal, "Finish the implementation");
  assert.equal(statuses.get("goal"), "goal: Finish the implementation");
  assert.equal((await events.get("agent_before_settle")!({ entries: [], context: { llmMessages: [], contextEntries: [] } }, context)).continue, true);

  await commands.get("showgoal")!.handler("", context as any);
  assert.match(notifications.at(-1)!, /Finish the implementation/);

  await commands.get("ungoal")!.handler("", context as any);
  assert.equal(entries.at(-1).data.goal, null);
  assert.equal(statuses.get("goal"), undefined);
  assert.equal(await events.get("agent_before_settle")!({ entries: [], context: { llmMessages: [], contextEntries: [] } }, context), undefined);
});

test("an exact WORK DONE response to a goal check marks the goal complete", async () => {
  const events = new Map<string, (...args: any[]) => Promise<any>>();
  const commands = new Map<string, { handler: (...args: any[]) => Promise<void> }>();
  const entries: any[] = [];
  goalExtension({
    on: (event: string, handler: (...args: any[]) => Promise<any>) => events.set(event, handler),
    registerCommand: (name: string, options: { handler: (...args: any[]) => Promise<void> }) => commands.set(name, options),
    appendEntry: (customType: string, data: unknown) => entries.push({ customType, data }),
  } as any);
  const context = { ui: { notify: () => {}, setStatus: () => {} } };
  await commands.get("goal")!.handler("Ship it", context as any);

  const result = await events.get("agent_before_settle")!({
    entries: [],
    context: { llmMessages: [
      { role: "user", content: "Progress check: The active goal is: Ship it\n\nDetermine whether it is complete." },
      { role: "assistant", content: [{ type: "text", text: "WORK DONE" }] },
    ], contextEntries: [{ sourceEntry: { type: "custom_message", customType: "goal-check" }, messages: [{ role: "user" }] }] },
  }, context);

  assert.equal(result, undefined);
  assert.equal(entries.at(-1).data.goal, null);
});

test("a WORK DONE response before any goal-check prompt does not disable the goal", async () => {
  const events = new Map<string, (...args: any[]) => Promise<any>>();
  const commands = new Map<string, { handler: (...args: any[]) => Promise<void> }>();
  const entries: any[] = [];
  goalExtension({
    on: (event: string, handler: (...args: any[]) => Promise<any>) => events.set(event, handler),
    registerCommand: (name: string, options: { handler: (...args: any[]) => Promise<void> }) => commands.set(name, options),
    appendEntry: (customType: string, data: unknown) => entries.push({ customType, data }),
  } as any);
  const context = { ui: { notify: () => {}, setStatus: () => {} } };
  await commands.get("goal")!.handler("Ship it", context as any);

  const result = await events.get("agent_before_settle")!({
    entries: [],
    context: { llmMessages: [{ role: "assistant", content: "WORK DONE" }], contextEntries: [] },
  }, context);

  assert.equal(result.continue, true);
  assert.equal(entries.at(-1).data.goal, "Ship it");
});

test("a stale goal-check prompt does not authorize completion on a later user turn", async () => {
  const events = new Map<string, (...args: any[]) => Promise<any>>();
  const commands = new Map<string, { handler: (...args: any[]) => Promise<void> }>();
  const entries: any[] = [];
  goalExtension({
    on: (event: string, handler: (...args: any[]) => Promise<any>) => events.set(event, handler),
    registerCommand: (name: string, options: { handler: (...args: any[]) => Promise<void> }) => commands.set(name, options),
    appendEntry: (customType: string, data: unknown) => entries.push({ customType, data }),
  } as any);
  const context = { ui: { notify: () => {}, setStatus: () => {} } };
  await commands.get("goal")!.handler("Ship it", context as any);

  const result = await events.get("agent_before_settle")!({
    entries: [],
    context: { llmMessages: [
      { role: "user", content: "Progress check: The active goal is: Ship it" },
      { role: "assistant", content: "I am making progress." },
      { role: "user", content: "Can you check the latest test result?" },
      { role: "assistant", content: "WORK DONE" },
    ], contextEntries: [{ sourceEntry: { type: "message" }, messages: [{ role: "user" }] }] },
  }, context);

  assert.equal(result.continue, true);
  assert.equal(entries.at(-1).data.goal, "Ship it");
});
