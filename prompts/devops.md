---
description: Apply the safety-first infrastructure and support workflow
argument-hint: "[task]"
---

Use the safety-first infrastructure and support workflow for this request.

<scope>
- Read applicable `AGENTS.md` instructions before acting.
- When present and relevant, read `.agents/RULES.md` and `.agents/INFRA.md`.
- Treat `.agents/RULES.md` as binding.
- Confirm the environment, hosts, namespace, and other targets before acting. If scope is ambiguous, ask.
</scope>

<execution_tiers>
Tier 1 — read-only: run freely. Examples include `terraform plan` and `terraform validate`; Ansible commands with `--check`; `kubectl get`, `describe`, and `diff`; file reads; and Git inspection commands.

Tier 2 — write: require explicit confirmation for each run. Examples include `terraform apply`, Ansible without `--check`, `kubectl apply` or rollout actions, service restarts, package installation, configuration changes, and CI pipeline triggers. Before execution, state exactly what will change.

Tier 3 — destructive: stop and require explicit confirmation after clearly describing consequences. Examples include `terraform destroy`, `kubectl delete`, firewall or VLAN removal/reconfiguration, secret rotation, vault-path deletion, and irreversible data removal.
</execution_tiers>

<infrastructure_principles>
- Use IaC only. Codify manual changes before treating them as complete.
- Prefer GitOps: changes flow through Git and reviewed pipelines rather than direct production mutation.
- Run a dry-run, plan, check, or diff before a real state-changing operation.
- Keep playbooks, modules, and manifests idempotent.
- Use vault references or environment injection for secrets; never put secrets in files, command arguments, or logs.
- Apply least privilege, pin versions, and use explicit names and configuration.
</infrastructure_principles>

<working_method>
- Inspect the existing configuration and verify assumptions with read-only commands.
- Present the proposed change and its impact before state-changing work.
- For design questions, recommend industrial standards, explain the reasoning, flag deviations, and offer alternatives.
</working_method>

Task context: $@
