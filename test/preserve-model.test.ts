import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePreservedModel,
  shouldPreserveModelOnSessionStart,
} from "../src/preserve-model/session.ts";

const model = { provider: "opencode", id: "muse-spark-1.3" };

const registry = {
  find: (provider: string, modelId: string) =>
    provider === model.provider && modelId === model.id ? model : undefined,
  hasConfiguredAuth: () => true,
};

test("preserves only on /new with a previous session file", () => {
  assert.equal(shouldPreserveModelOnSessionStart("new", "/tmp/prev.jsonl"), true);
  assert.equal(shouldPreserveModelOnSessionStart("new", undefined), false);
  assert.equal(shouldPreserveModelOnSessionStart("new", ""), false);
  assert.equal(shouldPreserveModelOnSessionStart("resume", "/tmp/prev.jsonl"), false);
  assert.equal(shouldPreserveModelOnSessionStart("startup", undefined), false);
  assert.equal(shouldPreserveModelOnSessionStart("fork", "/tmp/prev.jsonl"), false);
});

test("resolves the previous model when present and authenticated", () => {
  assert.equal(
    resolvePreservedModel(registry, { provider: "opencode", modelId: "muse-spark-1.3" }),
    model,
  );
});

test("yields undefined for missing refs, unknown models, and missing auth", () => {
  assert.equal(resolvePreservedModel(registry, null), undefined);
  assert.equal(resolvePreservedModel(registry, { provider: "", modelId: "" }), undefined);
  assert.equal(
    resolvePreservedModel(registry, { provider: "other", modelId: "unknown" }),
    undefined,
  );
  assert.equal(
    resolvePreservedModel({ ...registry, hasConfiguredAuth: () => false }, {
      provider: "opencode",
      modelId: "muse-spark-1.3",
    }),
    undefined,
  );
});
