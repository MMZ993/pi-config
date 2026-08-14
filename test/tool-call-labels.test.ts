import assert from "node:assert/strict";
import test from "node:test";

import backgroundTerminal from "../extensions/bg-terminal/index.ts";
import fileSearch from "../extensions/file-search.ts";
import subagents from "../extensions/subagents/index.ts";
import { createToolResultPreview } from "../src/tool-rendering/result-preview.ts";
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
  type Renderer = (parameters: Record<string, unknown>, theme: typeof theme) => { render(width: number): string[] };
  type ResultRenderer = (result: { content: Array<{ type: string; text?: string }> }, options: { expanded: boolean }, theme: typeof theme) => { render(width: number): string[] };
  const tools = new Map<string, { renderCall?: Renderer; renderResult?: ResultRenderer }>();
  const fakePi = {
    registerTool(tool: { name: string; renderCall?: Renderer; renderResult?: ResultRenderer }) { tools.set(tool.name, tool); },
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
  assert.equal(tools.get("fd")?.renderResult?.({ content: [{ type: "text", text: "first" }] }, { expanded: false }, theme).render(200).join("").trimEnd(), "first");
  assert.equal(tools.get("rg")?.renderResult?.({ content: [{ type: "text", text: "first" }] }, { expanded: false }, theme).render(200).join("").trimEnd(), "first");
  assert.equal(tools.get("subagent_run")?.renderResult?.({ content: [{ type: "text", text: "first" }] }, { expanded: false }, theme).render(200).join("").trimEnd(), "first");
}

test("fd, rg, subagent, and background tools render their call arguments", verifiesToolCallRenderers);

test("collapsed result previews preserve the requested end of output and expand fully", () => {
  const theme = { fg: (_color: string, text: string) => text };
  const output = "one\ntwo\nthree\nfour";

  assert.deepEqual(createToolResultPreview(output, false, "head", theme, 2, "ctrl+o to expand").render(80).map((line) => line.trimEnd()), ["one", "two", "... (2 more lines, ctrl+o to expand)"]);
  assert.deepEqual(createToolResultPreview(output, false, "tail", theme, 2, "ctrl+o to expand").render(80).map((line) => line.trimEnd()), ["... (2 earlier lines, ctrl+o to expand)", "three", "four"]);
  assert.deepEqual(createToolResultPreview(output, true, "head", theme, 2, "ctrl+o to expand").render(80).map((line) => line.trimEnd()), ["one", "two", "three", "four"]);
});
