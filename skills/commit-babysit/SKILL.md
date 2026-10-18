---
name: commit-babysit
description: End-to-end flow for a fix or change: review, commit, push, CI deployment, and verification, running only explicitly approved operations. Use only when the user explicitly requests a commit babysit.
---

# Commit Babysit

Full e2e flow for one logical change: review → commit → push → CI deploy → verify → report. The default mode is scoped approval: the agent proposes the exact operation scope first, the user approves, and only approved operations run.

## Operating Modes

### Default: scoped approval

1. Analyze the change and the affected repositories/services.
2. Produce an explicit operation scope and ask for approval before doing anything. Enumerate every consequential action, for example:

   > Scope for this babysit:
   > - commit `fix: X` on `develop` in `homelab-services` and push
   > - MR to `develop` (if working on a feature/bugfix branch)
   > - trigger and approve the `searxng` CI check + manual apply job
   > - verify via the `searxng-verify` job result
   > - ssh to `10.10.30.x` to check the service is healthy
   > Approve all of these?

3. Only execute approved operations, in order. Any new operation not in the approved scope (different host, another service apply, an extra pipeline, a Vault write) requires a new scope proposal and approval.
4. When a step fails or reveals something unexpected, stop and re-scope; do not improvise.

### Full approval

The user may grant blanket approval up front (for example: "babysit commit, you have my full approval"). Then the approved scope is the entire e2e flow for this one change, without per-step confirmation. This never overrides:

- **Destructive or dangerous content:** if the change being babysat would delete data, drop a database/dataset, weaken security, expose a secret or a vulnerability, or remove a safety mechanism (firewall rule, ACL, snapshot), stop and raise the concern before proceeding. Behave like a responsible engineer telling a manager a planned action is wrong: state the risk, the evidence, and a safer alternative, then wait for an explicit decision.
- **Scope creep:** full approval covers this one change's e2e flow, not unrelated work discovered along the way.
- **New dangerous operations:** anything destructive (deletions, `destroy`, state reset, rollback of snapshots) still requires an explicit confirmation regardless of prior approval.

## Pre-flight

- Locate repos under `~/projects/homelab/` (core: `homelab-services`, `homelab-infra`, `homelab-ctl`, `homelab-wiki`; other homelab repos live in the same directory). Some additional projects may live directly under `~/projects/`.
- Repo flow:
  - `homelab-infra`, `homelab-services`: never commit to `main`; work happens on `develop` or `feature/*`/`bugfix/*` merged to `develop` via MR. CI runs from `develop`.
  - `homelab-ctl`, `homelab-wiki`: `main` directly, no CI.
- Run available tests/pre-commit (`mise exec -- pre-commit run --all-files` in `homelab-services`). Report results; fix only failures caused by the change.
- Scan the diff for secrets. Never stage or push secret material.
- Load and follow the `commit` skill for every commit produced during this flow: atomic, single-line `type: description`, explicit paths, never `--no-verify`.

## Deployment (CI-first)

All applies happen through GitLab CI, never by running write operations locally.

- `homelab-services` (`develop` push or web pipeline):
  1. Check job runs automatically for changed service paths (or trigger via `DEPLOY_SERVICE=<name>` web pipeline).
  2. For snapshot-managed services (Vault 350, Authentik 340, GitLab 310, Traefik 600, Omada 210, Home Assistant 500, OpenClaw 570, Hermes 571) the CI snapshot `predeploy-<service>-<ts>` is created automatically before apply; include snapshot creation and verification in the proposed scope.
  3. Approve/run the **manual apply job** — this must be in the approved scope explicitly.
  4. Verify job runs automatically after apply; review its result.
- `homelab-infra`: `develop` push changing `terraform/pve01/` produces validate + saved plan; the **manual apply job consumes the saved plan**. Review the plan output in CI before running apply; never apply locally.
- Staged/canary rollouts: `ANSIBLE_LIMIT=<hosts>` pipeline variable (see wiki Canary release). Lockout-risk services (`linux-hardening`, `dmz-*` firewall/access): warn that Proxmox console access should be at hand.
- Merge `develop` → `main` only after a real apply + verify succeed, and only if it was in the approved scope.

## Vault Operations

Vault changes (adding policies, granting read scopes to CI jobs, writing entries) follow these rules without exception:

- Vault CLI being authorized (logged in) in the agent shell is **not** approval. Vault writes require explicit user approval — include them explicitly in the operation scope.
- CI jobs use restricted per-job read scopes; a new CI secret read requires a policy/role change via the **ansible key and the vault admin key**.
- The vault admin key lives in a git-ignored file under `homelab-services/secrets/`. It may not be present on every machine: check existence with `ls`/`test` first; if absent, report and stop — never work around it.
- **Never read key files.** Use them only by passing the file path to the tool that consumes it (for example `VAULT_TOKEN@file` style or the documented wrapper). Never `cat`, `read`, `grep`, or otherwise print key contents.
- Write Vault entries through a secure non-echoing path (HCL/JSON payload file piped to `vault write`, payload built without secrets appearing in shell history or logs). Secret values supplied by the user must not end up in transcripts, files committed to git, or command history.

## Babysit and Escalation

- Monitor pipeline jobs (via `glab` or GitLab API) until terminal state; report each stage result.
- On failure: stop, report the failing job and its log excerpt, propose rollback options (predeploy snapshot rollback, `main` as last-known-good baseline), and wait for direction. Do not retry blindly.
- On success: report what was changed, deployed, and verified; list unexecuted suggestions (e.g. `develop` → `main` merge) instead of doing them.

## References

- `homelab-wiki/architecture/CICD_BRANCH_STRATEGY.md`
- `homelab-wiki/procedures/operations/CANARY_RELEASE.md`
- `homelab-wiki/procedures/operations/PREDEPLOY_SNAPSHOTS.md`
- `homelab-wiki/procedures/operations/CI_SERVICE_ONBOARDING.md`
- `homelab-wiki/architecture/SECRETS_AND_CONFIG.md`
