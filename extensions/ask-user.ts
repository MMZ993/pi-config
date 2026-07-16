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
  status: "answered" | "dismissed" | "unavailable";
};

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
      const options = params.options.map((option) => option.label);
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
