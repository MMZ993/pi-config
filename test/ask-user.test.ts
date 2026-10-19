import assert from "node:assert/strict";
import test from "node:test";
import askUser from "../extensions/ask-user.ts";

test("ask_user can be disabled for the active session and restored from that session's entries", async () => {
  const events = new Map<string, (...args: any[]) => Promise<any>>();
  const commands = new Map<string, { handler: (...args: any[]) => Promise<void> }>();
  const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
  const entries: any[] = [];
  let activeBranch: any[] = entries;
  const statuses = new Map<string, string | undefined>();
  let selections = 0;

  askUser({
    on: (event: string, handler: (...args: any[]) => Promise<any>) => events.set(event, handler),
    registerCommand: (name: string, options: { handler: (...args: any[]) => Promise<void> }) => commands.set(name, options),
    registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool),
    appendEntry: (customType: string, data: unknown) => entries.push({ customType, data }),
  } as any);

  const context = {
    hasUI: true,
    sessionManager: { getBranch: () => activeBranch.map((entry) => ({ type: "custom", customType: entry.customType, data: entry.data })) },
    ui: {
      notify: () => {},
      setStatus: (key: string, value: string | undefined) => statuses.set(key, value),
      select: async () => { selections += 1; return "1. Yes"; },
      input: async () => "",
    },
  };
  const params = { question: "Proceed?", options: [{ label: "Yes" }, { label: "No" }] };
  const tool = tools.get("ask_user")!;

  await events.get("session_start")!({}, context);
  assert.equal((await tool.execute("call-1", params, undefined, undefined, context)).details.status, "answered");

  await commands.get("ask-user")!.handler("off", context);
  const disabled = await tool.execute("call-2", params, undefined, undefined, context);
  assert.equal(disabled.details.status, "disabled");
  assert.match(disabled.content[0].text, /disabled for this session/);
  assert.equal(selections, 1);
  assert.equal(statuses.get("ask-user"), "ask_user off");

  await events.get("session_start")!({}, context);
  assert.equal((await tool.execute("call-3", params, undefined, undefined, context)).details.status, "disabled");

  activeBranch = [];
  assert.equal((await tool.execute("call-4", params, undefined, undefined, context)).details.status, "answered");
  assert.equal(statuses.get("ask-user"), undefined);

  activeBranch = entries;
  await events.get("session_start")!({}, context);
  await commands.get("ask-user")!.handler("on", context);
  assert.equal((await tool.execute("call-5", params, undefined, undefined, context)).details.status, "answered");
  assert.equal(selections, 3);
});
