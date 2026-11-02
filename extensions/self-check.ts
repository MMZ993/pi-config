import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type SelfCheckPhase = "armed" | "verifying" | "passed" | "failed" | "exhausted" | "cleared" | "cancelled-goal";
type SelfCheckState = { check: string | null; iterations: number; phase: SelfCheckPhase; note?: string };
type Branch = Array<{ customType?: string; data?: unknown }>;

const STATE_ENTRY = "self-check-state";
const CHECK_CUSTOM_TYPE = "self-check-check";
const GOAL_STATE_ENTRY = "goal-state";
const MAX_ITERATIONS = 3;
/** All valid phases; unknown stored values fall back to "armed". */
const KNOWN_PHASES: readonly SelfCheckPhase[] = ["armed", "verifying", "passed", "failed", "exhausted", "cleared", "cancelled-goal"];
/** Phases that represent a finished lifecycle; they never resume verification. */
const TERMINAL_PHASES: readonly SelfCheckPhase[] = ["passed", "failed", "exhausted", "cleared", "cancelled-goal"];

/** Finds the latest self-check state in the active session branch; null when none is stored. */
function latestState(branch: Branch): SelfCheckState | null {
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry.customType !== STATE_ENTRY) continue;
    const data = entry.data as Partial<SelfCheckState> | undefined;
    if (!data || typeof data !== "object") continue;
    return {
      check: typeof data.check === "string" && data.check.trim() ? data.check : null,
      iterations: typeof data.iterations === "number" && Number.isInteger(data.iterations) && data.iterations >= 0 ? data.iterations : 0,
      phase: (KNOWN_PHASES as readonly string[]).includes(String(data.phase)) ? (data.phase as SelfCheckPhase) : "armed",
      note: typeof data.note === "string" ? data.note : undefined,
    };
  }
  return null;
}

/** Restores the in-memory state from the latest branch entry. */
function restored(branch: Branch): SelfCheckState | null {
  const state = latestState(branch);
  if (state && state.check && !TERMINAL_PHASES.includes(state.phase)) return state;
  return null;
}

/** True when a /goal is active in the branch; the goal extension owns the settle loop then. */
function goalActive(branch: Branch): boolean {
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry.customType !== GOAL_STATE_ENTRY) continue;
    const data = entry.data as { goal?: unknown } | undefined;
    return typeof data?.goal === "string" && data.goal.trim() !== "";
  }
  return false;
}

type Ui = { notify(message: string, level?: string): void; setStatus(key: string, value: string | undefined): void };
type Ctx = { sessionManager: { getBranch(): Branch }; hasUI?: boolean; ui?: Ui };

function notify(ctx: Ctx, message: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx?.hasUI) ctx.ui?.notify(message, level);
}

/**
 * Registers the self-check: a bounded settlement gate that, before Pi settles once,
 * re-sends the armed verification condition and gives the agent a bounded chance to
 * verify and report via the self_check tool (pass/fail with evidence, at most
 * MAX_ITERATIONS continuations, then it disarms itself as failed-exhausted).
 * Coordination with the goal extension happens only through persisted session
 * entries, so handler registration order does not matter: self-check refuses to arm
 * while a /goal is active and disarms itself (with a notification) if a goal is
 * active at settlement time.
 */
export default function selfCheckExtension(pi: ExtensionAPI): void {
  let state: SelfCheckState | null = null;
  /** Last known state, kept for status/debugging after the check disarms or a terminal state is restored. */
  let lastOutcome: SelfCheckState | null = null;

  const active = (): boolean => state !== null && state.check !== null;

  const updateStatus = (ctx: Ctx): void => {
    ctx?.ui?.setStatus("self-check", active() ? `self-check (${state!.iterations}/${MAX_ITERATIONS}): ${state!.check}` : undefined);
  };

  const save = (next: SelfCheckState, ctx?: Ctx): void => {
    state = next;
    pi.appendEntry<SelfCheckState>(STATE_ENTRY, next);
    updateStatus(ctx);
  };

  const disarm = (phase: SelfCheckPhase, note: string, ctx?: Ctx): void => {
    if (!state) return;
    save({ check: null, iterations: state.iterations, phase, note }, ctx);
  };

  const restore = (ctx: Ctx): void => {
    state = restored(ctx.sessionManager.getBranch());
    if (!state) {
      const last = latestState(ctx.sessionManager.getBranch());
      lastOutcome = last ?? null;
    } else {
      lastOutcome = state;
    }
    updateStatus(ctx);
  };

  const describe = (): string => {
    if (!state) {
      const last = lastOutcome;
      return last ? `No self-check armed (last outcome: ${last.phase}${last.note ? `: ${last.note}` : ""}).` : "No self-check armed.";
    }
    if (active()) return `Self-check armed (${state.iterations}/${MAX_ITERATIONS} continuations used): ${state.check}`;
    return `No self-check armed (last outcome: ${state.phase}${state.note ? `: ${state.note}` : ""}).`;
  };

  /**
   * Arms or replaces the check. Arming the same check again is rejected so repeated
   * calls cannot reset the budget; arming a different check replaces it only when the
   * caller explicitly passes replace=true, and the used budget is kept so replacement
   * cannot bypass the continuation limit.
   */
  const arm = (procedure: string, replace: boolean, ctx: Ctx): { ok: boolean; message: string } => {
    if (goalActive(ctx.sessionManager.getBranch())) {
      notify(ctx, "A /goal is active; the self-check stays off so only one settle loop runs. Clear the goal with /ungoal first.", "warning");
      return { ok: false, message: "Self-check not armed: a /goal is active, and only one settle loop may run. Clear it with /ungoal, or fold this verification into the goal text." };
    }
    if (active() && state!.check === procedure) {
      return { ok: false, message: `This exact check is already armed (${state!.iterations}/${MAX_ITERATIONS} continuations used); the attempt budget is preserved and not reset.` };
    }
    if (active() && !replace) {
      return { ok: false, message: `A different check is already armed: ${state!.check}. Call set again with replace=true to deliberately replace it (the used continuation budget is kept), or clear first.` };
    }
    if (active()) {
      save({ check: procedure, iterations: state!.iterations, phase: "armed" }, ctx);
      return { ok: true, message: `Self-check replaced (used continuation budget preserved: ${state!.iterations}/${MAX_ITERATIONS}): ${procedure}` };
    }
    save({ check: procedure, iterations: 0, phase: "armed" }, ctx);
    return { ok: true, message: `Self-check armed (max ${MAX_ITERATIONS} continuations): ${procedure}` };
  };

  pi.on("session_start", async (_event, ctx) => restore(ctx));
  pi.on("session_tree", async (_event, ctx) => restore(ctx));

  pi.registerCommand("self-check", {
    description: "Arm a bounded pre-stop verification loop; /self-check off|status",
    handler: async (args, ctx) => {
      const input = args.trim();
      if (!input) {
        ctx.ui.notify(`Usage: /self-check <condition> | /self-check off | /self-check status\n${describe()}`, "info");
        return;
      }
      if (input === "off") {
        const wasArmed = active();
        disarm("cleared", "manually cleared");
        ctx.ui.notify(wasArmed ? "Self-check disarmed." : "No self-check was armed.", "info");
        return;
      }
      if (input === "status") {
        ctx.ui.notify(describe(), "info");
        return;
      }
      const result = arm(input, false, ctx);
      ctx.ui.notify(result.message, result.ok ? "info" : "warning");
    },
  });

  const SelfCheckParams = Type.Object({
    action: Type.Union(
      [Type.Literal("set"), Type.Literal("pass"), Type.Literal("fail"), Type.Literal("clear"), Type.Literal("status")],
      { description: "set arms the check, pass records verified success, fail records explicit failure, clear disarms manually, status reports state." },
    ),
    check: Type.Optional(Type.String({
      description: "For set: the acceptance condition plus how to verify it (repeatable, inexpensive, observable). Required for set.",
    })),
    evidence: Type.Optional(Type.String({
      description: "For pass: what was actually verified and how (test results, API responses, inspected state). Required for pass.",
    })),
    reason: Type.Optional(Type.String({
      description: "For fail: why verification did not succeed. Optional for fail.",
    })),
    replace: Type.Optional(Type.Boolean({
      description: "For set: must be true to deliberately replace an already-armed check with different criteria. The used continuation budget is preserved.",
    })),
  });

  pi.registerTool({
    name: "self_check",
    label: "Self-check",
    description:
      "Autonomous verification gate. Use it for nontrivial multi-step work with concrete acceptance criteria: early in the task, call it with action=set, giving the acceptance condition and a repeatable, inexpensive way to verify it (tests, API responses, inspected state — never assumptions). Before you finish, the gate re-sends the condition; run the verification, then report action=pass with real evidence (allowed only after the gate triggered verification) or action=fail with the reason. Failing verification gives you bounded retries (max 3) to fix and re-verify. Skip it for trivial tasks and while a /goal is active.",
    promptSnippet: "Bounded self-verification: arm acceptance criteria early, verify with evidence before settling",
    promptGuidelines: [
      "For nontrivial multi-step work with concrete acceptance criteria, arm self_check(set) early in the task with the success condition and how to verify it; prefer observable, repeatable, inexpensive checks and do not arm overlapping checks.",
      "Before settling while self-check is armed, actually run the verification and report the outcome with self_check: pass with concrete evidence (test results, API responses, inspected state) or fail with the reason. Never declare a check passed based only on an assumption.",
      "Do not arm self_check for trivial tasks, while a /goal is active, or repeatedly for the same criteria; the verify skill defines appropriate verification methods.",
    ],
    parameters: SelfCheckParams,
    executionMode: "sequential",

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = params.action;
      if (action === "set") {
        const procedure = params.check?.trim();
        if (!procedure) {
          return { content: [{ type: "text", text: "self_check set requires a `check`: the acceptance condition plus how you will verify it." }], details: { armed: false, reason: "missing-check" } };
        }
        const result = arm(procedure, params.replace === true, ctx);
        if (!result.ok) {
          return { content: [{ type: "text", text: result.message }], details: { armed: false, reason: goalActive(ctx.sessionManager.getBranch()) ? "goal-active" : "already-armed" } };
        }
        return {
          content: [{ type: "text", text: `${result.message}\nBefore you stop, the gate will ask you to verify this condition. Run the verification, then call self_check(pass) with evidence or self_check(fail) with the reason.` }],
          details: { armed: true, iterations: state!.iterations, max: MAX_ITERATIONS },
        };
      }
      if (action === "pass") {
        if (!active()) {
          return { content: [{ type: "text", text: `No self-check is armed; nothing to pass. ${describe()}` }], details: { armed: false, reason: "not-armed" } };
        }
        if (state!.iterations < 1 || state!.phase !== "verifying") {
          return { content: [{ type: "text", text: "self_check pass is only valid after the gate triggered verification (it happens once the current turn tries to settle). Continue working; the verification request arrives before you stop." }], details: { armed: true, reason: "pass-before-verification" } };
        }
        const evidence = params.evidence?.trim();
        if (!evidence) {
          return { content: [{ type: "text", text: "self_check pass requires `evidence`: what you verified and how (test results, API responses, inspected state)." }], details: { armed: true, reason: "missing-evidence" } };
        }
        disarm("passed", evidence, ctx);
        notify(ctx, `Self-check passed: ${evidence}`, "info");
        return { content: [{ type: "text", text: "Self-check passed and disarmed. Provide your normal final response to the user now, including the verification evidence." }], details: { armed: false, phase: "passed" } };
      }
      if (action === "fail") {
        if (!active()) {
          return { content: [{ type: "text", text: `No self-check is armed; nothing to fail. ${describe()}` }], details: { armed: false, reason: "not-armed" } };
        }
        const reason = params.reason?.trim() || "no reason given";
        disarm("failed", reason, ctx);
        notify(ctx, `Self-check failed (disarmed): ${reason}`, "warning");
        return { content: [{ type: "text", text: "Self-check failure recorded and disarmed. Explain the verification failure in your normal final response to the user." }], details: { armed: false, phase: "failed" } };
      }
      if (action === "clear") {
        const wasArmed = active();
        disarm("cleared", "manually cleared", ctx);
        notify(ctx, "Self-check disarmed.", "info");
        return { content: [{ type: "text", text: wasArmed ? "Self-check disarmed." : "Self-check was not armed." }], details: { armed: false } };
      }
      return { content: [{ type: "text", text: describe() }], details: { armed: active(), iterations: state?.iterations ?? 0, max: MAX_ITERATIONS, phase: state?.phase, lastOutcome: state ? undefined : lastOutcome } };
    },
  });

  pi.on("agent_before_settle", (event, ctx) => {
    if (!active()) return;

    const branch = ctx.sessionManager.getBranch();
    if (goalActive(branch)) {
      const check = state!.check;
      disarm("cancelled-goal", "cancelled because a /goal became active", ctx);
      notify(ctx, `Self-check cancelled (disarmed) because a /goal became active and owns the settle loop. Unverified check: ${check}`, "warning");
      return;
    }

    if (state!.iterations >= MAX_ITERATIONS) {
      // Unconditional limit: once MAX continuations have been used, no further
      // continuation is ever injected, regardless of what the latest prompt was.
      const check = state!.check;
      disarm("exhausted", `verification not confirmed after ${MAX_ITERATIONS} continuations: ${check}`, ctx);
      notify(ctx, `Self-check exhausted its ${MAX_ITERATIONS}-continuation budget and disarmed. Verification was NOT successful: ${check}`, "error");
      return;
    }

    const next: SelfCheckState = { check: state!.check, iterations: state!.iterations + 1, phase: "verifying" };
    save(next, ctx);
    const finalAttempt = next.iterations === MAX_ITERATIONS
      ? ` This is the final verification attempt: if the check still does not pass, you must clearly explain the remaining failure and its cause to the user in your final response.`
      : "";
    return {
      entries: [
        ...event.entries,
        {
          type: "custom_message" as const,
          customType: CHECK_CUSTOM_TYPE,
          content: `Self-check verification (attempt ${next.iterations} of ${MAX_ITERATIONS}): ${next.check}\n\nRun this verification against the current state now, using real evidence. When it passes, call the self_check tool with action=pass and the evidence. When it does not pass, fix the problem and, if you then verify success, call self_check(pass); if it cannot pass, call self_check(fail) with the reason. Do not claim success without evidence.${finalAttempt}`,
          display: false,
        },
      ],
      continue: true,
    };
  });
}
