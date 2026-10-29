/** Pure state helpers for the tmux-backed subagent extension. */

/** Thinking levels accepted by the Pi CLI's `--thinking` option. */
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = typeof THINKING_LEVELS[number];

/** Builds argument-safe CLI tokens for one child Pi process. */
export function buildWorkerPiArgs(options: {
  tools: string[];
  provider: string;
  modelId: string;
  promptPath: string;
  thinkingLevel?: ThinkingLevel;
}): string[] {
  return [
    "--mode", "json", "--print", "--no-session", "--tools", options.tools.join(","),
    "--provider", options.provider, "--model", options.modelId,
    ...(options.thinkingLevel ? ["--thinking", options.thinkingLevel] : []),
    `@${options.promptPath}`,
  ];
}

/** Returns whether a completed worker belongs to the active Pi session. */
export function shouldInjectCompletion(originSessionId: string, activeSessionId: string): boolean {
  return originSessionId === activeSessionId;
}

/** Returns whether a persisted run belongs to this session and requires completion delivery. */
export function shouldRestoreRun(originSessionId: string, activeSessionId: string, notifyOnCompletion: boolean): boolean {
  return notifyOnCompletion && shouldInjectCompletion(originSessionId, activeSessionId);
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

/** Resolves the child worker model, defaulting to the main session's active model. */
export function resolveModelSelection(
  parameters: { model?: string; provider?: string },
  activeModel: { id: string; provider: string } | undefined,
): { provider: string; modelId: string } {
  const requested = parameters.model?.trim() ?? "";
  let provider = parameters.provider?.trim() ?? "";
  let modelId = requested;
  const separator = requested.indexOf("/");
  if (separator > 0) {
    provider = provider || requested.slice(0, separator);
    modelId = requested.slice(separator + 1);
  }
  if (!modelId && activeModel) modelId = activeModel.id;
  if (!provider && activeModel) provider = activeModel.provider;
  if (!modelId || !provider) throw new Error("Unable to resolve a model for the subagent; pass model or provider explicitly.");
  return { provider, modelId };
}

/** Counts running or launching workers that should be shown as active in the shared TUI status. */
export function countRunningRuns(statuses: string[]): number {
  return statuses.filter((status) => status === "running" || status === "launching").length;
}
