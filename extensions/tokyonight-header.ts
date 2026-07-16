import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function center(line: string, width: number): string {
  return " ".repeat(Math.max(0, Math.floor((width - visibleWidth(line)) / 2))) + line;
}

function renderHeader(width: number, theme: Theme): string[] {
  const logo = [" ██████╗ ██╗", " ██╔══██╗██║", " ██████╔╝██║", " ██╔═══╝ ██║", " ██║     ██║", " ╚═╝     ╚═╝"];
  const lines = [
    ...Array.from({ length: 20 }, () => ""),
    ...logo.map((line) => center(theme.fg("accent", line), width)),
    center(theme.fg("muted", "~/.pi/agent"), width),
    "",
  ];

  return lines.map((line) => truncateToWidth(line, width));
}

export default function (pi: ExtensionAPI) {
  pi.on("resources_discover", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    ctx.ui.setHeader((_tui, theme) => ({
      render(width: number): string[] {
        return renderHeader(width, theme);
      },
      invalidate() {},
    }));
  });

  pi.registerCommand("default-header", {
    description: "Restore Pi's built-in startup header",
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined);
      ctx.ui.notify("Built-in header restored", "info");
    },
  });
}
