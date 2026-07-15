---
name: debugging
description: Investigate a reproducible failure systematically and identify its root cause before changing code. Use when verification fails.
---

# Debugging

Do not apply speculative symptom fixes. Identify a root cause first.

## Investigation

1. Read the complete error output, stack trace, paths, line numbers, and relevant warnings.
2. Reproduce the failure with the smallest reliable command. If it is intermittent, gather evidence before proposing a fix.
3. Inspect the current diff and recent relevant commits to identify what changed.
4. Trace the failing value, state, or control flow back to its source. Fix the source rather than masking the symptom.
5. Find comparable working code and project conventions; use it to test the hypothesis.
6. State the confirmed root cause and the smallest corrective change before editing.

## After fixing

Run the originally failing check, then load and follow the `verify` skill for the relevant broader checks.

## Stop conditions

Stop and report the evidence, attempted investigations, and blocker when the root cause cannot be identified. Do not keep making random changes.
