import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import safetyNet from "../extensions/safety-net.ts";

const state = await import("../src/safety-net/state.ts");

test("safety net state persists and gates bash calls across instances", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-safety-net-"));
  const events = new Map<string, (...args: any[]) => Promise<any>>();
  const commands = new Map<string, { handler: (...args: any[]) => Promise<void> }>();
  const statuses = new Map<string, string | undefined>();
  let confirmCalls = 0;

  const statePathSetter = state;

  const build = () => {
    events.clear();
    commands.clear();
    safetyNet({
      on: (event: string, handler: (...args: any[]) => Promise<any>) => events.set(event, handler),
      registerCommand: (name: string, options: { handler: (...args: any[]) => Promise<void> }) => commands.set(name, options),
    } as any);
  };

  const context = () => ({
    hasUI: true,
    ui: {
      confirm: async () => { confirmCalls += 1; return false; },
      notify: () => {},
      setStatus: (key: string, value: string | undefined) => statuses.set(key, value),
    },
  });

  const originalHome = process.env.HOME;
  process.env.HOME = dir;
  try {
    build();
    await events.get("session_start")!({}, context());
    const blocked = await events.get("tool_call")!({ toolName: "bash", input: { command: "git reset --hard" } }, context());
    assert.equal(blocked.block, true);
    assert.equal(confirmCalls, 1);
    assert.equal(statuses.get("safety-net"), undefined);

    await commands.get("safety")!.handler("off", context());
    assert.equal(statuses.get("safety-net"), "safety net off");
    const allowed = await events.get("tool_call")!({ toolName: "bash", input: { command: "git reset --hard" } }, context());
    assert.equal(allowed, undefined);
    assert.equal(confirmCalls, 1);

    const persisted = await state.readEnabled();
    assert.equal(persisted, false);

    build();
    await events.get("session_start")!({}, context());
    const stillAllowed = await events.get("tool_call")!({ toolName: "bash", input: { command: "mkfs.ext4 /dev/sda1" } }, context());
    assert.equal(stillAllowed, undefined);
    assert.equal(statuses.get("safety-net"), "safety net off");

    await commands.get("safety")!.handler("on", context());
    assert.equal(statuses.get("safety-net"), undefined);
    const blockedAgain = await events.get("tool_call")!({ toolName: "bash", input: { command: "mkfs.ext4 /dev/sda1" } }, context());
    assert.equal(blockedAgain.block, true);
  } finally {
    process.env.HOME = originalHome;
    await rm(dir, { recursive: true, force: true });
  }
});

test("resolve target accepts on, off, enable, and disable", () => {
  const { resolveTarget } = state;
  assert.equal(resolveTarget("on"), true);
  assert.equal(resolveTarget("ENABLE"), true);
  assert.equal(resolveTarget("off"), false);
  assert.equal(resolveTarget("disable "), false);
  assert.equal(resolveTarget(""), undefined);
  assert.equal(resolveTarget("status"), undefined);
});
