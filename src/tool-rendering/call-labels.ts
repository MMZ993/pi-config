/** Describes the common arguments displayed for a file-discovery call. */
type FdCall = {
  pattern?: string;
  path?: string;
  glob?: boolean;
  hidden?: boolean;
  type?: string;
  extension?: string;
  maxDepth?: number;
};

/** Describes the common arguments displayed for a content-search call. */
type RgCall = {
  pattern: string;
  path?: string;
  fixedStrings?: boolean;
  hidden?: boolean;
  glob?: string;
  fileType?: string;
  context?: number;
};

/** Describes the launch arguments displayed for a subagent call. */
type SubagentRunCall = { task: string; mode?: "blocking" | "background"; timeoutSeconds?: number };

/** Describes the launch arguments displayed for a background-command call. */
type BackgroundStartCall = { command: string; title?: string };

/** Produces a single-line, bounded summary suitable for a TUI tool-call header. */
function summarize(value: string, maximumLength = 120): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= maximumLength ? compact : `${compact.slice(0, maximumLength - 1)}…`;
}

/** Formats an fd call's search target and non-default display options. */
export function formatFdCall(parameters: FdCall): string {
  const options = [
    parameters.glob ? "glob" : undefined,
    parameters.hidden ? "hidden" : undefined,
    parameters.type ? `type=${parameters.type}` : undefined,
    parameters.extension ? `*.${parameters.extension.replace(/^\.+/, "")}` : undefined,
    parameters.maxDepth !== undefined ? `depth=${parameters.maxDepth}` : undefined,
  ].filter((option): option is string => option !== undefined);
  return `fd ${parameters.pattern || "*"}${parameters.path ? ` ${parameters.path}` : ""}${options.length ? ` (${options.join(", ")})` : ""}`;
}

/** Formats an rg call's pattern, optional target path, and display options. */
export function formatRgCall(parameters: RgCall): string {
  const options = [
    parameters.fixedStrings ? "fixed strings" : undefined,
    parameters.hidden ? "hidden" : undefined,
    parameters.glob ? `glob=${parameters.glob}` : undefined,
    parameters.fileType ? `type=${parameters.fileType}` : undefined,
    parameters.context !== undefined ? `context=${parameters.context}` : undefined,
  ].filter((option): option is string => option !== undefined);
  return `rg ${JSON.stringify(summarize(parameters.pattern, 100))}${parameters.path ? ` ${parameters.path}` : ""}${options.length ? ` (${options.join(", ")})` : ""}`;
}

/** Formats a subagent launch call without exposing its full multi-line prompt. */
export function formatSubagentRunCall(parameters: SubagentRunCall): string {
  const options = [
    parameters.mode === "background" ? "background" : undefined,
    parameters.timeoutSeconds !== undefined ? `timeout ${parameters.timeoutSeconds}s` : undefined,
  ].filter((option): option is string => option !== undefined);
  return `subagent_run ${summarize(parameters.task)}${options.length ? ` (${options.join(", ")})` : ""}`;
}

/** Formats a background command launch call and its optional user-facing title. */
export function formatBackgroundStartCall(parameters: BackgroundStartCall): string {
  return `$ ${summarize(parameters.command)}${parameters.title ? ` (${summarize(parameters.title, 80)})` : ""}`;
}

/** Formats a lifecycle-tool call which takes one stable run or job identifier. */
export function formatIdCall(toolName: string, identifier: string): string {
  return `${toolName} ${identifier}`;
}
