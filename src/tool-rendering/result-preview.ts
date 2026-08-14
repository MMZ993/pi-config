import { keyHint } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";

/** Selects the output end retained in a collapsed TUI preview. */
type PreviewDirection = "head" | "tail";

/** Provides the theme operation needed to color result text and its expansion hint. */
type PreviewTheme = { fg(color: "toolOutput" | "muted", text: string): string };

/** Limits the default collapsed result preview to a compact number of visual lines. */
const DEFAULT_PREVIEW_LINES = 12;

/** Creates a result component that collapses visually while preserving full model content. */
export function createToolResultPreview(
  output: string,
  expanded: boolean,
  direction: PreviewDirection,
  theme: PreviewTheme,
  previewLines = DEFAULT_PREVIEW_LINES,
  expandHint?: string,
): Text | { render(width: number): string[]; invalidate(): void } {
  const styledOutput = output.split("\n").map((line) => theme.fg("toolOutput", line)).join("\n");
  if (expanded) return new Text(styledOutput, 0, 0);

  return {
    render(width: number): string[] {
      const lines = new Text(styledOutput, 0, 0).render(width);
      if (lines.length <= previewLines) return lines;
      const visible = direction === "head" ? lines.slice(0, previewLines) : lines.slice(-previewLines);
      const skipped = lines.length - previewLines;
      const relation = direction === "head" ? "more" : "earlier";
      const hint = theme.fg("muted", `... (${skipped} ${relation} lines, ${expandHint ?? keyHint("app.tools.expand", "to expand")})`);
      return direction === "head"
        ? [...visible, truncateToWidth(hint, width, "...")]
        : [truncateToWidth(hint, width, "..."), ...visible];
    },
    invalidate(): void {},
  };
}

/** Extracts text blocks from a tool result without changing their model-facing content. */
export function getToolResultText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block): block is { type: string; text: string } => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}
