import assert from "node:assert/strict";
import test from "node:test";

import {
  countRunningRuns,
  resolveModelSelection,
  shouldInjectCompletion,
  shouldRestoreRun,
  shouldWatchCompletion,
  summarizeWorkerEvent,
} from "../src/subagents/state.ts";

/** Verifies worker completion cannot enter an unrelated Pi session. */
function verifiesSessionBoundCompletion(): void {
  assert.equal(
    shouldInjectCompletion("origin-session", "origin-session"),
    true,
  );
  assert.equal(
    shouldInjectCompletion("origin-session", "fresh-session"),
    false,
  );
}

test("completion injection is restricted to the originating session", verifiesSessionBoundCompletion);

/** Verifies reload only restores workers whose results still need asynchronous delivery. */
function verifiesOnlyAsynchronousRunsRestore(): void {
  assert.equal(shouldRestoreRun("origin", "origin", true), true);
  assert.equal(shouldRestoreRun("origin", "origin", false), false);
  assert.equal(shouldRestoreRun("origin", "other", true), false);
}

test("reload restores only asynchronously delivered subagents", verifiesOnlyAsynchronousRunsRestore);

/** Verifies status summarizes tool activity without retaining assistant response text. */
function verifiesProgressSummaryExcludesAssistantText(): void {
  assert.equal(
    summarizeWorkerEvent({
      type: "tool_execution_start",
      toolName: "read",
      args: { path: "/private/path" },
    }),
    "running read",
  );
  assert.equal(
    summarizeWorkerEvent({
      type: "message_update",
      message: { content: "private intermediate response" },
    }),
    undefined,
  );
}

test("worker progress retains only compact tool activity", verifiesProgressSummaryExcludesAssistantText);

/** Verifies timeout continuation receives the same completion watcher as background mode. */
function verifiesCompletionWatchModes(): void {
  assert.equal(shouldWatchCompletion("background", false), true);
  assert.equal(shouldWatchCompletion("blocking", true), true);
  assert.equal(shouldWatchCompletion("blocking", false), false);
  assert.equal(countRunningRuns(["running", "completed", "running"]), 2);
}

test("background and continued workers are monitored", verifiesCompletionWatchModes);

/** Verifies child model resolution defaults to the active session model. */
function verifiesModelSelectionDefaultsAndOverrides(): void {
  const active = { id: "glm-4.6", provider: "zai" };
  assert.deepEqual(resolveModelSelection({}, active), { provider: "zai", modelId: "glm-4.6" });
  assert.deepEqual(resolveModelSelection({ model: "openai-codex/gpt-5.6-luna" }, active), { provider: "openai-codex", modelId: "gpt-5.6-luna" });
  assert.deepEqual(resolveModelSelection({ model: "gpt-5.6-luna", provider: "openai-codex" }, active), { provider: "openai-codex", modelId: "gpt-5.6-luna" });
  assert.deepEqual(resolveModelSelection({ provider: "openai-codex" }, active), { provider: "openai-codex", modelId: "glm-4.6" });
  assert.throws(() => resolveModelSelection({}, undefined), /Unable to resolve a model/);
}

test("model selection defaults to the active session model", verifiesModelSelectionDefaultsAndOverrides);
