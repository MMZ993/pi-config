import { homedir } from "node:os";
import { join } from "node:path";

import {
  FD_DEFAULT_LIMIT,
  FD_MAX_DEPTH,
  RG_DEFAULT_LIMIT,
  RG_MAX_CONTEXT,
  RG_MAX_LIMIT,
  type FdParameters,
  type RgParameters,
} from "./config.ts";

/** Maps fd entry-type inputs to their command-line flags. */
const FD_TYPE_FLAGS = {
  file: "f",
  directory: "d",
  symlink: "l",
} as const;

/** Keeps numeric arguments within their documented inclusive range. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

/** Normalizes paths copied from model context without resolving relative paths. */
function normalizePath(path: string): string {
  const normalized = path.trim().replace(/^@/, "");
  if (normalized === "~") return homedir();
  if (normalized.startsWith("~/")) return join(homedir(), normalized.slice(2));
  return normalized;
}

/** Adds an optional, normalized search path to command arguments. */
function appendPath(argumentsList: string[], path: string | undefined): void {
  if (!path) return;
  const normalized = normalizePath(path);
  if (normalized) argumentsList.push(normalized);
}

/** Builds the fd argument vector without invoking a shell. */
export function buildFdArguments(parameters: FdParameters): string[] {
  const argumentsList = ["--color=never"];
  if (parameters.hidden) argumentsList.push("--hidden");
  if (parameters.glob) argumentsList.push("--glob");
  if (parameters.type) argumentsList.push("--type", FD_TYPE_FLAGS[parameters.type]);
  if (parameters.extension) {
    argumentsList.push("--extension", parameters.extension.replace(/^\.+/, ""));
  }
  if (parameters.maxDepth !== undefined) {
    argumentsList.push(
      "--max-depth",
      String(clamp(parameters.maxDepth, 1, FD_MAX_DEPTH)),
    );
  }
  argumentsList.push(
    "--max-results",
    String(clamp(parameters.limit ?? FD_DEFAULT_LIMIT, 1, FD_DEFAULT_LIMIT)),
    "--",
    parameters.pattern ?? "",
  );
  appendPath(argumentsList, parameters.path);
  return argumentsList;
}

/** Builds the rg argument vector without invoking a shell. */
export function buildRgArguments(parameters: RgParameters): string[] {
  const argumentsList = [
    "--line-number",
    "--color=never",
    "--no-heading",
    "--with-filename",
  ];
  if (parameters.caseSensitive === true) argumentsList.push("--case-sensitive");
  else if (parameters.caseSensitive === false) argumentsList.push("--ignore-case");
  else argumentsList.push("--smart-case");
  if (parameters.fixedStrings) argumentsList.push("--fixed-strings");
  if (parameters.hidden) argumentsList.push("--hidden");
  if (parameters.context !== undefined) {
    argumentsList.push(
      "--context",
      String(clamp(parameters.context, 0, RG_MAX_CONTEXT)),
    );
  }
  if (parameters.glob) argumentsList.push("--glob", parameters.glob);
  if (parameters.fileType) argumentsList.push("--type", parameters.fileType);
  argumentsList.push(
    "--max-count",
    String(clamp(parameters.limit ?? RG_DEFAULT_LIMIT, 1, RG_MAX_LIMIT)),
    "--",
    parameters.pattern,
  );
  appendPath(argumentsList, parameters.path);
  return argumentsList;
}
