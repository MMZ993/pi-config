import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFdArguments,
  buildRgArguments,
} from "../src/file-search/arguments.ts";

/** Verifies fd cannot interpret a user-supplied pattern as a command option. */
function verifiesFdPatternSeparator(): void {
  assert.deepEqual(
    buildFdArguments({
      pattern: "-generated",
      path: "src",
      type: "file",
      extension: ".ts",
      hidden: true,
      maxDepth: 3,
      limit: 50,
    }),
    [
      "--color=never",
      "--hidden",
      "--type",
      "f",
      "--extension",
      "ts",
      "--max-depth",
      "3",
      "--max-results",
      "50",
      "--",
      "-generated",
      "src",
    ],
  );
}

test("fd keeps a dash-prefixed pattern after the option separator", verifiesFdPatternSeparator);

/** Verifies rg defaults to smart case and cannot interpret its pattern as an option. */
function verifiesRgPatternSeparator(): void {
  assert.deepEqual(buildRgArguments({ pattern: "--help" }), [
    "--line-number",
    "--color=never",
    "--no-heading",
    "--with-filename",
    "--smart-case",
    "--max-count",
    "100",
    "--",
    "--help",
  ]);
}

test("rg uses smart case and separates a dash-prefixed pattern", verifiesRgPatternSeparator);
