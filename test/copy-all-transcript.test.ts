import assert from "node:assert/strict";
import test from "node:test";
import { formatTranscript } from "../src/copy-all/transcript.ts";

test("copy-all formats user assistant and tool result messages", () => {
  const transcript = formatTranscript([
    { type: "message", message: { role: "user", content: [{ type: "text", text: "Question" }] } },
    { type: "message", message: { role: "assistant", content: [{ type: "text", text: "Answer" }] } },
    { type: "message", message: { role: "toolResult", toolName: "read", content: [{ type: "text", text: "file" }] } },
    { type: "custom", message: { role: "assistant", content: "skip" } },
  ]);
  assert.equal(transcript, "USER:\nQuestion\n\n---\n\nASSISTANT:\nAnswer\n\n---\n\nTOOL (read):\nfile");
});
