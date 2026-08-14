import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Loads the package-owned system guidance once for all turns in this process. */
const guidance = readFile(fileURLToPath(new URL("../system-prompt/APPEND_SYSTEM.md", import.meta.url)), "utf8");

/** Appends the package-owned system guidance without replacing Pi or project instructions. */
export default function systemGuidance(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${await guidance}`,
  }));
}
