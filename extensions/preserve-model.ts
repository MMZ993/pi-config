import { SessionManager, type ExtensionAPI, type ThinkingLevel } from "@earendil-works/pi-coding-agent";
import { resolvePreservedModel, shouldPreserveModelOnSessionStart } from "../src/preserve-model/session.ts";

/** Carries the previous session's model and thinking level across /new. */
export default function preserveModel(pi: ExtensionAPI): void {
  pi.on("session_start", async (event, ctx) => {
    if (!shouldPreserveModelOnSessionStart(event.reason, event.previousSessionFile)) return;
    let previous: { model: { provider: string; modelId: string } | null; thinkingLevel: string };
    try {
      previous = SessionManager.open(event.previousSessionFile as string).buildSessionContext();
    } catch {
      return;
    }
    const model = resolvePreservedModel(ctx.modelRegistry, previous.model);
    if (!model) return;
    const applied = await pi.setModel(model);
    if (applied && previous.thinkingLevel) {
      pi.setThinkingLevel(previous.thinkingLevel as ThinkingLevel);
    }
  });
}
