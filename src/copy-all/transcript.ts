/** Formats readable user, assistant, and tool-result session messages as a clipboard transcript. */
export function formatTranscript(entries: Array<{ type?: string; message?: { role?: string; toolName?: string; content?: unknown } }>): string {
  return entries.flatMap((entry) => {
    if (entry.type !== "message") return [];
    const message = entry.message;
    if (!message || !["user", "assistant", "toolResult"].includes(message.role ?? "")) return [];
    const text = contentText(message.content).trim();
    if (!text) return [];
    const label = message.role === "toolResult" ? `TOOL (${message.toolName ?? "unknown"})` : message.role!.toUpperCase();
    return [`${label}:\n${text}`];
  }).join("\n\n---\n\n");
}

/** Extracts text and image placeholders from Pi message content blocks. */
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((block) => {
    if (!block || typeof block !== "object") return [];
    const value = block as { type?: unknown; text?: unknown };
    if (value.type === "text" && typeof value.text === "string") return [value.text];
    if (value.type === "image") return ["[image]"];
    return [];
  }).join("\n");
}
