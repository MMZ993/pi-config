import assert from "node:assert/strict";
import test from "node:test";

import backgroundTerminal from "../extensions/bg-terminal/index.ts";
import fileSearch from "../extensions/file-search.ts";
import subagents from "../extensions/subagents/index.ts";
import {
  formatBackgroundStartCall,
  formatFdCall,
  formatRgCall,
  formatSubagentRunCall,
} from "../src/tool-rendering/call-labels.ts";

test("tool call labels describe the requested operation", () => {
  assert.equal(formatFdCall({ pattern: "*.ts", path: "src", glob: true }), "fd *.ts src (glob)");
  assert.equal(formatRgCall({ pattern: "TODO", path: "extensions", fixedStrings: true }), 'rg "TODO" extensions (fixed strings)');
  assert.equal(formatSubagentRunCall({ task: "Review the extension rendering\nwithout making changes.", mode: "background" }), "subagent_run Review the extension rendering without making changes. (background)");
  assert.equal(formatBackgroundStartCall({ command: "npm run test", title: "tests" }), "$ npm run test (tests)");
});

/** Verifies each affected extension supplies a visible TUI call renderer. */
function verifiesToolCallRenderers(): void {
  const tools = new Map<string, { renderCall?: (parameters: Record<string, unknown>, theme: typeof theme) => { render(width: number): string[] } }>();
  const fakePi = {
    registerTool(tool: { name: string; renderCall?: (parameters: Record<string, unknown>, theme: typeof theme) => { render(width: number): string[] } }) { tools.set(tool.name, tool); },
    on() {},
  };
  const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
  fileSearch(fakePi as never);
  subagents(fakePi as never);
  backgroundTerminal(fakePi as never);

  assert.equal(tools.get("fd")?.renderCall?.({ pattern: "*.ts", path: "src", glob: true }, theme).render(200).join("").trimEnd(), "fd *.ts src (glob)");
  assert.equal(tools.get("rg")?.renderCall?.({ pattern: "TODO", path: "src" }, theme).render(200).join("").trimEnd(), 'rg "TODO" src');
  assert.equal(tools.get("subagent_run")?.renderCall?.({ task: "Inspect the extension", mode: "background" }, theme).render(200).join("").trimEnd(), "subagent_run Inspect the extension (background)");
  assert.equal(tools.get("bg_start")?.renderCall?.({ command: "npm run test", title: "tests" }, theme).render(200).join("").trimEnd(), "$ npm run test (tests)");
}

test("fd, rg, subagent, and background tools render their call arguments", verifiesToolCallRenderers);
