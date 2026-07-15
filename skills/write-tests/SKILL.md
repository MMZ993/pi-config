---
name: write-tests
description: Write one behavior-oriented failing test before implementing a testable code change. Use for test-first development.
---

# Write Tests

Write the test before implementation. The test defines the required behavior, not the implementation.

## Process

1. Read existing nearby tests.
2. Write one failing test for the current behavior. Do not write a batch of speculative tests before implementing.
3. Follow the session's established project conventions for test location, framework, fixtures, and naming. If none exist, ask before establishing a new convention.
4. Run the focused test before implementation.
5. Confirm that it fails for the intended missing behavior, rather than due to syntax, setup, imports, or unrelated failures.

## Test quality

- Test observable behavior, not implementation details.
- Use a descriptive name that explains the expected outcome.
- Keep the test independent, deterministic, and fast.
- Assert one outcome, or a small group of assertions for one behavior.
- Do not add skipped, placeholder, always-passing, or commented-out tests.

Fix test infrastructure first when it prevents a meaningful failing test. For documentation, configuration, or another genuinely untestable change, state why a test is not applicable before implementing.
