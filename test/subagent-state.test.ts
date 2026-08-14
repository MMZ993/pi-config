import assert from "node:assert/strict";
import test from "node:test";

import {
  countRunningRuns,
  shouldInjectCompletion,
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
