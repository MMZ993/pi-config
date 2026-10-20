import assert from "node:assert/strict";
import test from "node:test";
import subagents from "../extensions/subagents/index.ts";
import { THINKING_LEVELS } from "../src/subagents/state.ts";

test("subagent_run exposes supported Pi thinking levels as an optional tool argument", () => {
  const definitions: Array<{ name: string; parameters: { properties: Record<string, unknown> } }> = [];
  subagents({
    registerTool: (definition: { name: string; parameters: { properties: Record<string, unknown> } }) => definitions.push(definition),
    on: () => () => {},
  } as any);

  const schema = definitions.find((definition) => definition.name === "subagent_run")?.parameters.properties.thinkingLevel as {
    type: string;
    enum: string[];
    description: string;
  };
  assert.equal(schema.type, "string");
  assert.deepEqual(schema.enum, [...THINKING_LEVELS]);
  assert.match(schema.description, /thinking level/i);
});
