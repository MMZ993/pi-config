
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import environment from "../extensions/environment.ts";

test("environment loads, toggles and persists by branch, then handles missing file", async () => {
  const originalHome = process.env.HOME;
  const dir = await mkdtemp(join(tmpdir(), "pi-env-test-"));
  process.env.HOME = dir;

  try {
    const path = join(dir, ".pi", "agent");
    await mkdir(path, { recursive: true });
    await writeFile(
      join(path, "environment.md"),
      "# VM host\nBind test servers to the private interface.",
    );

    const events = new Map<string, (...args: any[]) => any>();
    const commands = new Map<string, { handler: (...args: any[]) => any }>();
    let entries: any[] = [];
    const statuses = new Map<string, string | undefined>();
    let message = "";

    environment({
      on: (name: string, handler: (...args: any[]) => any) =>
        events.set(name, handler),
      registerCommand: (name: string, opts: any) =>
        commands.set(name, opts),
      appendEntry: (customType: string, data: any) =>
        entries.push({ customType, data }),
    } as any);

    const context = {
      hasUI: true,
      sessionManager: { getBranch: () => entries },
      ui: {
        setStatus: (key: string, value: string | undefined) =>
          statuses.set(key, value),
        notify: (value: string) => { message = value; },
      },
    };

    const prompt = () =>
      events.get("before_agent_start")!(
        { systemPrompt: "BASE" },
        context,
      )?.systemPrompt || "BASE";

    await events.get("session_start")!({}, context);
    assert.match(prompt(), /^BASE\n\n<host_environment>\n# VM host/);
    assert.equal(prompt().match(/<host_environment>/g)?.length, 1);

    await commands.get("environment")!.handler("off", context);
    assert.equal(prompt(), "BASE");
    assert.equal(statuses.get("environment"), "environment off");

    // Resume the same session
    await events.get("session_start")!({}, context);
    assert.equal(prompt(), "BASE");

    await commands.get("environment")!.handler("on", context);
    assert.match(prompt(), /VM host/);

    // New session
    entries = [];
    await events.get("session_start")!({}, context);
    assert.match(prompt(), /VM host/);

    // Missing file
    await rm(join(path, "environment.md"));
    await events.get("session_start")!({}, context);
    assert.equal(prompt(), "BASE");

    await commands.get("environment")!.handler("status", context);
    assert.match(message, /missing\/unreadable/);

    // File is read on session_start, not every turn
    await writeFile(join(path, "environment.md"), "NEW MACHINE");
    assert.equal(prompt(), "BASE");

    await events.get("session_start")!({}, context);
    assert.match(prompt(), /NEW MACHINE/);
  } finally {
    process.env.HOME = originalHome;
    await rm(dir, { recursive: true, force: true });
  }
});

