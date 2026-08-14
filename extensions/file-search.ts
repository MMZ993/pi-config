import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

import {
  FdSchema,
  RgSchema,
  SEARCH_BINARIES,
  type FdParameters,
  type RgParameters,
} from "../src/file-search/config.ts";
import {
  buildFdArguments,
  buildRgArguments,
} from "../src/file-search/arguments.ts";

/** Identifies the system-managed binary to execute. */
type SearchTool = keyof typeof SEARCH_BINARIES;

/** Represents text returned to the model after output-limit handling. */
type FormattedOutput = {
  text: string;
  truncated: boolean;
};

/** Persists complete truncated output in a retained temporary directory. */
async function persistFullOutput(tool: SearchTool, output: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `pi-${tool}-`));
  const path = join(directory, "output.txt");
  await writeFile(path, output, "utf8");
  return path;
}

/** Limits tool output to Pi's standard bounds and preserves truncated output. */
async function formatOutput(tool: SearchTool, output: string): Promise<FormattedOutput> {
  const trimmed = output.replace(/\n+$/, "");
  const truncated = truncateHead(trimmed, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  if (!truncated.truncated) return { text: trimmed, truncated: false };

  const fullOutputPath = await persistFullOutput(tool, trimmed);
  return {
    text:
      `${truncated.content}\n\n[Output truncated: ${truncated.outputLines} of ${truncated.totalLines} lines ` +
      `(${formatSize(truncated.outputBytes)} of ${formatSize(truncated.totalBytes)}). ` +
      `Full output saved to: ${fullOutputPath}]`,
    truncated: true,
  };
}

/** Executes a dotfiles-managed search binary without invoking a shell. */
async function runSearch(
  pi: ExtensionAPI,
  tool: SearchTool,
  argumentsList: string[],
  signal: AbortSignal | undefined,
): Promise<FormattedOutput | undefined> {
  let result: Awaited<ReturnType<ExtensionAPI["exec"]>>;
  try {
    result = await pi.exec(SEARCH_BINARIES[tool], argumentsList, {
      signal,
      timeout: 30_000,
    });
  } catch (error) {
    const message = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(
      `${tool} is unavailable. Install it through the dotfiles-managed mise configuration${message}`,
    );
  }

  if (result.code === 1) return undefined;
  if (result.code !== 0) {
    throw new Error(`${tool} failed (exit ${result.code}): ${result.stderr.trim()}`);
  }
  return formatOutput(tool, result.stdout);
}

/** Registers safe, bounded fd and rg tools backed only by system binaries. */
export default function fileSearch(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "fd",
    label: "Find Files",
    description:
      "Find files and directories by name with the system-managed fd binary. Results respect .gitignore and are limited to 1000 entries.",
    promptSnippet: "Find files and directories by name with fd.",
    promptGuidelines: [
      "Use fd instead of bash when discovering files or directories by name, extension, or glob.",
    ],
    parameters: FdSchema,
    async execute(_toolCallId, parameters: FdParameters, signal) {
      const output = await runSearch(pi, "fd", buildFdArguments(parameters), signal);
      if (!output) {
        return { content: [{ type: "text" as const, text: "No files found" }] };
      }
      return { content: [{ type: "text" as const, text: output.text }] };
    },
  });

  pi.registerTool({
    name: "rg",
    label: "Search Content",
    description:
      "Search file contents with the system-managed ripgrep binary. Results respect .gitignore and are limited to 100 matches per file.",
    promptSnippet: "Search file contents with ripgrep.",
    promptGuidelines: [
      "Use rg instead of bash when searching file contents; use fd when searching file names.",
    ],
    parameters: RgSchema,
    async execute(_toolCallId, parameters: RgParameters, signal) {
      const output = await runSearch(pi, "rg", buildRgArguments(parameters), signal);
      if (!output) {
        return { content: [{ type: "text" as const, text: "No matches found" }] };
      }
      return { content: [{ type: "text" as const, text: output.text }] };
    },
  });
}
