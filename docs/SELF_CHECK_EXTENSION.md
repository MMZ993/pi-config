# Self-Check Extension

Bounded, agent-managed verification gate: the agent arms acceptance criteria early, and the extension ensures it gets a bounded chance to verify them (with evidence) before the session settles.

## Usage

The agent calls the `self_check` tool autonomously; `/self-check <condition>|off|status` exists for humans to inspect or override.

- `set` (`check`, optional `replace`): arm the acceptance condition plus how to verify it. Refused while `/goal` is active. Re-arming the identical check is rejected (cannot reset the budget); a different check replaces the armed one only with explicit `replace: true`, and the used budget is preserved.
- `pass` (`evidence`): record verified success. Only valid after the gate triggered a verification continuation. Evidence is agent-attested; the extension does not independently verify it.
- `fail` (`reason`): record explicit failure, disarm, allow a normal final response.
- `clear`: manually disarm. `status`: inspect state.

## Lifecycle

1. Agent arms via `set` near task start.
2. On the first settlement attempt, the gate injects a verification continuation (1 of max 3) and phase becomes `verifying`.
3. Agent verifies; `pass` with evidence disarms and the agent gives its normal final response. No pass/fail, or an unconfirmed check, continues the loop until 3 continuations are used.
4. The limit is unconditional: once 3 continuations are used, no further continuation is injected regardless of the latest prompt. The final attempt's message instructs the agent to explain any remaining failure to the user. At exhaustion the check disarms with phase `exhausted` (error notification where UI exists); success is never inferred from budget exhaustion.

`MAX_ITERATIONS = 3`. Continuations used are persisted with the state, so reloads, resumes, and forks never reset the budget.

## State and coordination

State lives in `self-check-state` session entries (check, iterations, phase, note) and is restored from the active branch on `session_start` and `session_tree` (`/tree`, forks); the `verifying` phase is preserved so a restored in-progress check can be passed immediately. The last terminal outcome stays visible via `status` after reload without reactivating verification. Terminal phases (`passed`, `failed`, `exhausted`, `cleared`, `cancelled-goal`) never resume verification.

Coordination with the goal extension is purely via persisted `goal-state` entries — no direct coupling, registration-order independent:

- `/goal` active → `set` refuses.
- Goal becomes active while armed → self-check disarms itself (`cancelled-goal`, warning notification) and the goal loop owns the boundary.
- Self-check never auto-resumes after the goal completes.

Boundary entries from other extensions are always preserved (settle results spread `event.entries`).

## Autonomous behavior guidance

Prompt guidance (kept minimal; the `verify` skill owns verification methods): arm for nontrivial multi-step work with concrete acceptance criteria; prefer observable, repeatable, inexpensive checks; define condition and verification method together; never pass on assumptions; skip trivial tasks, overlapping checks, and active goals.

## Limitations

- Evidence is model-attested, not independently verified — this is a bounded self-report gate, not a validator.
- Works in all modes; notifications are guarded by `ctx.hasUI` (no-op in JSON/print mode).
- The pass gate trusts that a tool call made during the verification turn reflects a real verification run.

## References

- `extensions/self-check.ts`, `extensions/goal.ts`
- `test/self-check.test.ts`, `test/goal.test.ts`
- `skills/verify/SKILL.md`
- `docs/SUBAGENT_EXTENSION.md` (extension patterns)
