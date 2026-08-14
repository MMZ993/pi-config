import { copyToClipboard, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatTranscript } from "../src/copy-all/transcript.ts";

/** Registers /copy-all to copy the active session's readable conversation transcript. */
export default function copyAll(pi: ExtensionAPI): void {
  pi.registerCommand("copy-all", {
    description: "Copy all user, assistant, and tool-result messages in this session to the clipboard.",
    async handler(_args, ctx) {
      await ctx.waitForIdle();
      const transcript = formatTranscript(ctx.sessionManager.getBranch());
      if (!transcript) { ctx.ui.notify("No conversation messages to copy.", "info"); return; }
      await copyToClipboard(transcript);
      ctx.ui.notify("Copied conversation transcript to clipboard.", "info");
    },
  });
}
