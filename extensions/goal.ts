import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type GoalStateEntry = { goal: string | null };
const ENTRY_TYPE = "goal-state";
const GOAL_CHECK_PREFIX = "Progress check: The active goal is:";

/** Finds the latest goal state in the active session branch; returns null when no goal is active. */
function getActiveGoal(branch: Array<{ customType?: string; data?: unknown }>): string | null {
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry.customType !== ENTRY_TYPE) continue;
    const data = entry.data as Partial<GoalStateEntry> | undefined;
    return typeof data?.goal === "string" && data.goal.trim() ? data.goal : null;
  }
  return null;
}

/** Extracts plain text from a provider message for checking the exact completion response. */
function messageText(message: { content?: unknown }): string {
  if (typeof message.content === "string") return message.content.trim();
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter((part): part is { type: "text"; text: string } =>
      typeof part === "object" && part !== null && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
}

/** Registers session-persisted goal commands and prompts for progress before each natural settlement. */
export default function goalExtension(pi: ExtensionAPI): void {
  let goal: string | null = null;

  const updateStatus = (ctx: { ui: { setStatus(key: string, value: string | undefined): void } }): void => {
    ctx.ui.setStatus("goal", goal ? "goal active" : undefined);
  };

  const saveGoal = (nextGoal: string | null): void => {
    goal = nextGoal;
    pi.appendEntry<GoalStateEntry>(ENTRY_TYPE, { goal });
  };

  pi.on("session_start", async (_event, ctx) => {
    goal = getActiveGoal(ctx.sessionManager.getBranch());
    updateStatus(ctx);
  });

  pi.registerCommand("goal", {
    description: "Set a goal for Pi to work toward until /ungoal or completion",
    handler: async (args, ctx) => {
      const nextGoal = args.trim();
      if (!nextGoal) {
        ctx.ui.notify("Usage: /goal <goal>", "warning");
        return;
      }
      saveGoal(nextGoal);
      updateStatus(ctx);
      ctx.ui.notify(`Goal set: ${nextGoal}`, "info");
    },
  });

  pi.registerCommand("ungoal", {
    description: "Disable the active goal for this session",
    handler: async (_args, ctx) => {
      if (!goal) {
        ctx.ui.notify("No active goal.", "info");
        return;
      }
      saveGoal(null);
      updateStatus(ctx);
      ctx.ui.notify("Goal disabled for this session.", "info");
    },
  });

  pi.registerCommand("showgoal", {
    description: "Show the active goal without sending a prompt to Pi",
    handler: async (_args, ctx) => {
      ctx.ui.notify(goal ? `Active goal: ${goal}` : "No active goal.", "info");
    },
  });

  pi.on("agent_before_settle", (event) => {
    if (!goal) return;
    const messages = event.context.llmMessages;
    const lastMessage = messages.at(-1);
    const latestUserEntry = [...event.context.contextEntries].reverse().find((entry) =>
      entry.messages.some((message) => message.role === "user"));
    const isGoalCheckResponse = latestUserEntry?.sourceEntry.type === "custom_message" &&
      latestUserEntry.sourceEntry.customType === "goal-check";
    if (lastMessage?.role === "assistant" && isGoalCheckResponse && messageText(lastMessage) === "WORK DONE") {
      saveGoal(null);
      return;
    }

    return {
      entries: [
        ...event.entries,
        {
          type: "custom_message",
          customType: "goal-check",
          content: `${GOAL_CHECK_PREFIX} ${goal}\n\nDetermine whether this goal has actually been achieved based on the work and available evidence. If it has, respond with exactly WORK DONE. Otherwise, continue working toward it now; do not merely report progress or ask the user whether to continue.`,
          display: false,
        },
      ],
      continue: true,
    };
  });
}
