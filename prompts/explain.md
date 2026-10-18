---
description: Explain the previous response or a specific topic in more detail
argument-hint: "[what to explain]"
---

Expand on your previous response with a detailed explanation. Default to explaining the last response; if arguments are given, explain only that part of it.

<explanation>
- Answer in plain, structured language. Use headings or short sections when covering multiple points.
- Cover, where relevant: what was done and why, how it works, trade-offs and rejected alternatives, risks and edge cases, and how to verify or roll back the change.
- Walk through cause and effect step by step (code path, data flow, or infra dependency chain) instead of only restating the outcome.
- Reference concrete files, commands, line-level code, or configuration as evidence, not vague summaries.
- Do not change any files or run any write commands; this is explanation only.
</explanation>

<scope>
- Do not re-do the work, extend it, or start follow-up tasks. Explain, then stop.
- If something was wrong in the previous response, say so explicitly and explain what is wrong; do not silently fix it.
</scope>

What to explain: $@
