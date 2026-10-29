
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STATE_ENTRY = "environment-state";
const NOTIFY_IF_MISSING = false;
const filePath = () => join(homedir(), ".pi", "agent", "environment.md");

type Entry = { customType?: string; data?: { enabled?: unknown } };

function isDisabled(branch: readonly unknown[]): boolean {
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i] as Entry;
    if (entry.customType === STATE_ENTRY) return entry.data?.enabled === false;
  }
  return false;
}

export default function environment(pi: ExtensionAPI): void {
  let enabled = true;
  let content = "";
  let available = false;

  const updateStatus = (ctx: {
    ui: { setStatus(key: string, value: string | undefined): void };
  }): void => {
    ctx.ui.setStatus("environment", enabled ? undefined : "environment off");
  };

  pi.on("session_start", async (_event, ctx) => {
    enabled = !isDisabled(ctx.sessionManager.getBranch());
    content = "";
    available = false;

    try {
      content = (await readFile(filePath(), "utf8")).trim();
      available = true;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        if (NOTIFY_IF_MISSING && ctx.hasUI) {
          ctx.ui.notify(`No machine environment file: ${filePath()}`, "info");
        }
      } else {
        ctx.ui.notify(`Cannot read ${filePath()}: ${String(error)}`, "warning");
      }
    }

    updateStatus(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    enabled = !isDisabled(ctx.sessionManager.getBranch());
    updateStatus(ctx);
  });

  pi.registerCommand("environment", {
    description: "Control machine-specific system prompt context (on/off/status)",
    getArgumentCompletions: (prefix: string) =>
      ["on", "off", "status"]
        .filter((option) => option.startsWith(prefix.toLowerCase()))
        .map((option) => ({ value: option, label: option })),
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase() || "status";
      if (action === "status") {
        ctx.ui.notify(
          `Environment: ${enabled ? "on" : "off"}; file: ${available ? (content ? "loaded" : "empty") : "missing/unreadable"} (${filePath()})`,
          "info",
        );
        return;
      }
      if (action !== "on" && action !== "off") {
        ctx.ui.notify("Usage: /environment <on|off|status>", "warning");
        return;
      }
      enabled = action === "on";
      pi.appendEntry(STATE_ENTRY, { enabled });
      updateStatus(ctx);
      ctx.ui.notify(
        `Machine environment ${enabled ? "enabled" : "disabled"} for this session${!available ? " (file missing/unreadable)" : ""}.`,
        "info",
      );
    },
  });

  pi.on("before_agent_start", (event, ctx) => {
    enabled = !isDisabled(ctx.sessionManager.getBranch());
    updateStatus(ctx);
    if (!enabled || !content) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n<host_environment>\n${content}\n</host_environment>`,
    };
  });
}

