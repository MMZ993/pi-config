/** Pure state helpers for the tmux-backed subagent extension. */

/** Returns whether a completed worker belongs to the active Pi session. */
export function shouldInjectCompletion(originSessionId: string, activeSessionId: string): boolean {
  return originSessionId === activeSessionId;
}

/** Produces a compact status string without exposing worker response content. */
export function summarizeWorkerEvent(event: Record<string, unknown>): string | undefined {
  if (event.type !== "tool_execution_start") return undefined;
  return typeof event.toolName === "string" ? `running ${event.toolName}` : "running tool";
}

/** Returns whether a worker needs asynchronous completion monitoring. */
export function shouldWatchCompletion(mode: "blocking" | "background", continuedAfterTimeout: boolean): boolean {
  return mode === "background" || continuedAfterTimeout;
}

/** Counts workers that should be shown as active in the shared TUI status. */
export function countRunningRuns(statuses: string[]): number {
  return statuses.filter((status) => status === "running").length;
}
