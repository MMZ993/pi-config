import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const OptionSchema = Type.Object({
  label: Type.String({ description: "The selectable answer text." }),
  description: Type.Optional(
    Type.String({ description: "Optional context shown with the answer." }),
  ),
});

const AskUserParams = Type.Object({
  question: Type.String({ description: "The decision or clarification to ask." }),
  options: Type.Array(OptionSchema, {
    minItems: 2,
    maxItems: 5,
    description: "Two to five distinct choices for the user.",
  }),
});

type AskUserDetails = {
  question: string;
  options: string[];
  answer: string | null;
  wasCustom: boolean;
  cancelled: boolean;
  status: "answered" | "dismissed" | "unavailable" | "disabled";
};

const STATE_ENTRY = "ask-user-state";

/** Reads whether ask_user is disabled in the active session branch. */
function isDisabled(branch: Array<{ customType?: string; data?: unknown }>): boolean {
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry.customType !== STATE_ENTRY) continue;
    return (entry.data as { enabled?: unknown } | undefined)?.enabled === false;
  }
  return false;
}

function result(
  question: string,
  options: string[],
  answer: string | null,
  wasCustom: boolean,
  status: AskUserDetails["status"],
  text: string,
) {
  return {
    content: [{ type: "text" as const, text }],
    details: {
      question,
      options,
      answer,
      wasCustom,
      cancelled: status === "dismissed",
      status,
    } satisfies AskUserDetails,
  };
}

export default function askUser(pi: ExtensionAPI) {
  let enabled = true;

  const updateStatus = (ctx: { ui: { setStatus(key: string, value: string | undefined): void } }): void => {
    ctx.ui.setStatus("ask-user", enabled ? undefined : "ask_user off");
  };

  pi.on("session_start", async (_event, ctx) => {
    enabled = !isDisabled(ctx.sessionManager.getBranch());
    updateStatus(ctx);
  });

  pi.registerCommand("ask-user", {
    description: "Enable or disable the ask_user tool for this session (on/off/status)",
    handler: async (args, ctx) => {
      const target = args.trim().toLowerCase();
      if (target === "status" || !target) {
        ctx.ui.notify(enabled ? "ask_user is on for this session." : "ask_user is off for this session.", "info");
        return;
      }
      if (target !== "on" && target !== "off") {
        ctx.ui.notify("Usage: /ask-user <on|off|status>", "warning");
        return;
      }
      enabled = target === "on";
      pi.appendEntry(STATE_ENTRY, { enabled });
      updateStatus(ctx);
      ctx.ui.notify(enabled ? "ask_user enabled for this session." : "ask_user disabled for this session.", "info");
    },
  });

  pi.registerTool({

    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user one blocking multiple-choice question, with an optional custom answer.",
    promptSnippet: "Ask the user one multiple-choice clarification question when a decision is required",
    promptGuidelines: [
      "Use ask_user only for a decision that is necessary to proceed; ask one focused question at a time.",
    ],
    parameters: AskUserParams,
    executionMode: "sequential",

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      enabled = !isDisabled(ctx.sessionManager.getBranch());
      updateStatus(ctx);
      const options = params.options.map((option) => option.label);
      if (!enabled) {
        return result(
          params.question,
          options,
          null,
          false,
          "disabled",
          "ask_user is disabled for this session; proceed using the available information and state any necessary assumptions.",
        );
      }
      if (!ctx.hasUI) {
        return result(
          params.question,
          options,
          null,
          false,
          "unavailable",
          "The user cannot be prompted because this Pi mode has no interactive UI.",
        );
      }

      const choices = params.options.map((option, index) => {
        const description = option.description ? ` — ${option.description}` : "";
        return `${index + 1}. ${option.label}${description}`;
      });
      const customChoice = "Custom: write my own answer";
      const choice = await ctx.ui.select(params.question, [...choices, customChoice]);

      if (choice === undefined) {
        return result(
          params.question,
          options,
          null,
          false,
          "dismissed",
          "The user dismissed the question.",
        );
      }

      if (choice === customChoice) {
        const answer = await ctx.ui.input("Your answer:");
        const trimmed = answer?.trim();
        if (!trimmed) {
          return result(
            params.question,
            options,
            null,
            false,
            "dismissed",
            "The user dismissed the question.",
          );
        }
        return result(
          params.question,
          options,
          trimmed,
          true,
          "answered",
          `User wrote: ${trimmed}`,
        );
      }

      const index = choices.indexOf(choice);
      const answer = options[index];
      if (answer === undefined) {
        throw new Error("ask_user received an unrecognized selection.");
      }
      return result(
        params.question,
        options,
        answer,
        false,
        "answered",
        `User selected: ${index + 1}. ${answer}`,
      );
    },

    renderCall(args, theme) {
      const question = typeof args.question === "string" ? args.question : "";
      return new Text(
        theme.fg("toolTitle", theme.bold("ask_user ")) + theme.fg("muted", question),
        0,
        0,
      );
    },

    renderResult(toolResult, _options, theme) {
      const details = toolResult.details as AskUserDetails | undefined;
      if (!details || details.status === "dismissed") {
        return new Text(theme.fg("warning", "Question dismissed"), 0, 0);
      }
      if (details.status === "unavailable") {
        return new Text(theme.fg("warning", "Interactive UI unavailable"), 0, 0);
      }
      if (details.status === "disabled") {
        return new Text(theme.fg("warning", "ask_user disabled for this session"), 0, 0);
      }
      const prefix = details.wasCustom ? "(wrote) " : "";
      return new Text(
        theme.fg("success", "✓ ") +
          theme.fg("muted", prefix) +
          theme.fg("accent", details.answer),
        0,
        0,
      );
    },
  });
}
