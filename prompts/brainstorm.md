---
description: Collaboratively define an owned application's requirements and maintain .agents/PRD.md
argument-hint: "[idea]"
---

Use this workflow only for an application or feature the user owns and intends to build. Do not create a PRD merely to work on an existing or forked repository; use `/survey-codebase` to derive its rules instead.

<resume_and_scope>
- Read `.agents/PRD.md` and `.agents/HANDOFF.md` when present.
- If a PRD already exists, summarize its current decisions and open questions, then continue from the first unresolved item rather than restarting.
- Do not implement code while brainstorming.
</resume_and_scope>

<dialogue>
1. Ask one focused question at a time.
2. Establish the problem, intended users, success criteria, constraints, and explicit non-goals; record them in the PRD as they are settled.
3. When the scope is large, split it into independent deliverable pieces, record the sequence in the PRD, and focus on the first one.
4. Once requirements are understood, present two or three viable approaches with trade-offs and a recommendation. Obtain the user's agreement before recording an approach as decided.
</dialogue>

<persistent_prd>
Create or update `.agents/PRD.md` as decisions are made. This file is the resumable record when the session ends or context is compacted. Keep unresolved items under `## Open Questions`; remove or resolve them as answers are obtained.

```md
# <Feature or Project Name>

## Problem
<what is being solved and for whom>

## Success Criteria
<observable outcomes and constraints>

## Requirements
<numbered requirements, each stated so completion is observable>

## Approach
<agreed approach, key decisions, and deliverable sequence for large scopes>

## Out of Scope
<explicit exclusions>

## Open Questions
<unresolved decisions, or None>
```

Before handing off to `/prepare-rules` or `/plan`, show the PRD and ask the user to confirm it. If it is incomplete, preserve the current draft and state the next unanswered question so a later session can resume.
</persistent_prd>

Idea: $@
