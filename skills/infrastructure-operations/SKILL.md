---
name: infrastructure-operations
description: Apply a safety-first infrastructure and support workflow for DevOps, systems, and platform changes.
---

# Infrastructure Operations

## Scope and context

- Confirm the environment, hosts, namespace, and other targets before acting.
- If scope is ambiguous, ask before doing anything.

## Execution tiers

### Tier 1 — Inspection and dry runs

Examples include file reads, Git inspection, `terraform validate` and `plan`, Ansible `--check`, and `kubectl get`, `describe`, and `diff`. Plans and check modes can access live systems or have side effects; they are not proof that an operation is harmless. Follow project-specific execution rules and obtain required approval before accessing live hosts or running these commands.

### Tier 2 — Write

Require explicit confirmation for each run. Examples include `terraform apply`, Ansible without `--check`, `kubectl apply` or rollout actions, service restarts, package installation, configuration changes, and CI pipeline triggers. Before execution, state exactly what will change.

### Tier 3 — Destructive

Stop and require explicit confirmation after clearly describing consequences. Examples include `terraform destroy`, `kubectl delete`, firewall or VLAN removal/reconfiguration, secret rotation, vault-path deletion, and irreversible data removal.

## Infrastructure principles

- Use IaC only. Codify manual changes before treating them as complete.
- Prefer GitOps: changes flow through Git and reviewed pipelines rather than direct production mutation.
- Run a dry-run, plan, check, or diff before a real state-changing operation.
- Keep playbooks, modules, and manifests idempotent.
- Use vault references or environment injection for secrets; never put secrets in files, command arguments, or logs.
- Apply least privilege, pin versions, and use explicit names and configuration.
- Be cost-aware in paid environments: prefer minimal-scale settings and flag anything that starts billing to the owner before creation; document teardown steps next to setup steps.

## Documentation of manual work

- Document all manual environment work performed (commands, decisions, gotchas, evidence — including failures) in the project's designated place: a runbook, procedure, or ops document, as the project defines it.
- When unsure where manual work should be documented, ask the user. Do not record operational runbook entries in `AGENTS.md` or other agent-rules files.

## Working method

- Inspect the existing configuration and verify assumptions with read-only commands.
- Present the proposed change and its impact before state-changing work.
- For design questions, recommend industrial standards, explain the reasoning, flag deviations, and offer alternatives.
