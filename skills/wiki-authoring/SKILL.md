---
name: wiki-authoring
description: Create, revise, and maintain wiki documentation. Use only for requested documentation write or update work, not for reading or researching existing wiki content.
---

# Wiki Branch Model

The wiki is Git-based and uses Markdown files. Its three branches have distinct entry-point and publication behavior:

- `main` is rendered by GitLab/GitHub and uses `README.md` as its root document.
- `wiki-sync` provides two-way synchronization with Wiki.js and uses `home.md` as its root document. It represents the `README.md` root under the Wiki.js-required filename; root-document changes require a corresponding `home.md` update or a separate rename commit for this branch.
- `docs-publish` feeds a pipeline that publishes external/public documentation with MkDocs. The deployment process renders `index.md` from `README.md` or `home.md`; do not add `index.md` to Git solely for this purpose. This branch can intentionally diverge from the other branches when public content must be censored.

# Authoring Rules

## Publish only durable, useful documentation

- Write for a competent human operator first; it must also be clear enough for AI agents to navigate and use.
- Document the current, approved, and supportable state. Keep content factual, specific, and actionable.
- Every document must have a clear operational, architectural, procedural, or reference purpose. Do not create pages merely to record that work occurred.
- Do not add temporary notes, task scratchpads, meeting/discussion records, exploratory drafts, or unapproved proposals to the wiki. Keep them outside the wiki, normally local and untracked.
- An approved plan may be retained when it remains useful after implementation, such as for explaining a significant decision, migration, or operating model. Otherwise, remove it rather than preserving planning history.
- Treat all wiki content as potentially external-facing. Never include secrets, private credentials, internal-only personal information, or unnecessarily sensitive implementation detail. Keep public-release redactions confined to the intentionally divergent `docs-publish` branch.

## Make pages concise and maintainable

- Start each document with one sentence stating its purpose.
- Use sentence case for document titles and all headings. Use `UPPER_SNAKE_CASE.md` for human-facing document filenames, except required root files such as `README.md` and `home.md`; use lowercase paths for `/agents/` documents. Apply these conventions as pages are created or substantially revised; do not perform unrelated mass renames.
- Use a descriptive title, stable filename, short sections, and meaningful headings. Organize content by task or decision, not by chronology.
- Prefer precise statements, tables for structured facts, and one canonical working example over lengthy prose, alternatives, or duplicated instructions.
- State assumptions, prerequisites, ownership boundaries, and verification criteria only where an operator needs them.
- Link to the canonical related document instead of copying its content. Use relative Markdown links for wiki pages and code-formatted paths for external repositories. Update or remove stale links and superseded instructions with the change that makes them obsolete.
- Use consistent terminology, names, paths, and commands. Use absolute dates only when a date is operationally relevant; avoid relative time language such as “currently” or “recently.”
- Write procedures in imperative voice (“Run the playbook”); write reference material as direct factual statements. Avoid passive or impersonal phrasing such as “The playbook should be run” or “It is required to run.”

## Preserve trustworthy current state

- Treat Terraform, Ansible, CI configuration, and other declared configuration repositories as the source of truth for managed state; the wiki explains and indexes that state but does not replace it.
- Before adding or changing factual inventory, topology, versions, ports, addresses, or operational behavior, validate it against its authoritative source. Do not infer state from an older wiki page.
- When a fact intentionally appears in more than one wiki page, update all affected representations in the same change or explicitly link to one canonical page instead. Reconcile such duplication during page-review batches.
- Classify each page by its actual purpose. An incident record includes impact, timeline, root cause, resolution, and follow-up; an operational response page is a runbook. Do not label a runbook as an incident or preserve a temporary investigation as a permanent record.

## Write procedures for execution

- Put commands in copy-paste-ready fenced shell blocks and preserve their required order. State where to run them when that is not obvious.
- Add one short comment before a command block when it explains the block’s purpose, expected result, or safety boundary. Do not comment self-explanatory commands such as `cd`, `ls`, or other basic shell operations.
- Use shell comments only to annotate commands inside a shell block; use Markdown headings and prose for document structure.
- Include only the commands and context required to complete and verify the procedure. Clearly identify destructive, privileged, or production-affecting steps and give their verification command or expected result.
- Use placeholders that make required user-supplied values obvious, such as `<VAULT_ADMIN_TOKEN>`. Never put real secret values in commands, examples, or output.

## Review existing documentation in controlled batches

- Review one page or a small coherent batch at a time. First identify its purpose, intended audience, authoritative sources, and linked or duplicated pages.
- Correct only confirmed inaccuracies, obsolete instructions, inconsistent structure, and formatting that conflicts with these rules. Preserve useful historical incident and decision context.
- For each reviewed page, ensure its purpose sentence, title and heading style, references, command safety, and branch-specific handling meet these rules.
- Do not create a review log, discussion page, or temporary migration tracker in the wiki. Keep working notes outside it.

## Keep agent-only material separate

- Keep detailed, low-human-value agent guidance in `/agents/<topic>/<document>.md`, not in the human-facing document body.
- Use agent documents only when their precise operational guidance materially reduces agent context or search work; do not duplicate human documentation without a reason.
- Add a bottom-of-page reference from the human document when relevant: `Agent procedure/info: [description](/agents/<topic>/<document>.md).`
- Keep the human page self-contained for normal operation; the agent document is supplemental, not a required substitute.

## Maintain branch parity deliberately

- Update the root file appropriate to each branch: `README.md` on `main`, `home.md` on `wiki-sync`, and no committed generated `index.md` on `docs-publish`.
- When a root-page change must be synchronized, make the corresponding `wiki-sync` update or a dedicated rename commit.
- Do not overwrite intentional `docs-publish` redactions while synchronizing content. Review branch-specific differences before merging or copying pages.
