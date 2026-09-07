/** Pure and file-backed state helpers for the safety net extension. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Path of the machine-local safety net state file. */
export const stateFilePath = (): string => join(homedir(), ".pi", "agent", "safety-net-state.json");

/** Reads whether the safety net is enabled; defaults to enabled. */
export const readEnabled = async (): Promise<boolean> => {
  const raw = await readFile(stateFilePath(), "utf8").catch(() => "");
  if (!raw.trim()) return true;
  try {
    const parsed = JSON.parse(raw) as { enabled?: unknown };
    return parsed.enabled !== false;
  } catch {
    return true;
  }
};

/** Persists whether the safety net is enabled. */
export const writeEnabled = async (enabled: boolean): Promise<void> => {
  const path = stateFilePath();
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify({ enabled })}\n`, { mode: 0o600 });
};

/** Resolves a /safety command argument to a target state, or undefined for status-only. */
export const resolveTarget = (argument: string): boolean | undefined => {
  const normalized = argument.trim().toLowerCase();
  if (normalized === "on" || normalized === "enable") return true;
  if (normalized === "off" || normalized === "disable") return false;
  return undefined;
};
