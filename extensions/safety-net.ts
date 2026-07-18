import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Rule = {
  name: string;
  pattern: RegExp;
};

const hardBlockRules: Rule[] = [
  {
    name: "recursive deletion of a filesystem root or home directory",
    pattern:
      /\brm\s+(?=[^\n;|&]*(?:-r\w*|-\w*r\w*|--recursive))[^\n;|&]*\s(?:\/|\/\*|~\/?|\$HOME\/?|"\$HOME\/?"|'\$HOME\/?')\s*(?:$|[;&|])/i,
  },
  { name: "filesystem formatting", pattern: /\bmkfs(?:\.[a-z0-9]+)?\b/i },
  { name: "writing directly to a block device", pattern: /\bdd\b[^\n;|&]*\bof=\/dev\/(?:sd|vd|nvme|hd|mapper\/)/i },
  { name: "fork bomb", pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/ },
  { name: "download-and-execute pipeline", pattern: /\b(?:curl|wget)\b[^\n;|&]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/i },
  {
    name: "CBM installer or updater, which mutates detected agent configurations",
    pattern: /\bcodebase-memory-mcp\s+(?:install|update)\b/i,
  },
];

const confirmationRules: Rule[] = [
  { name: "recursive deletion", pattern: /\brm\s+(?=[^\n;|&]*(?:-r\w*|-\w*r\w*|--recursive))/i },
  { name: "hard Git reset", pattern: /\bgit\b[^\n;|&]*?\breset\s+--hard\b/i },
  { name: "Git clean", pattern: /\bgit\b[^\n;|&]*?\bclean\b[^\n;|&]*(?:--force\b|-[a-z]*f)/i },
  { name: "discarding Git changes", pattern: /\bgit\b[^\n;|&]*?\b(?:checkout\s+--|restore\b)/i },
  { name: "forced Git push", pattern: /\bgit\b[^\n;|&]*?\bpush\b[^\n;|&]*(?:--force(?:-with-lease)?\b|-f\b)/i },
  { name: "Terraform apply or destroy", pattern: /\bterraform\b[^\n;|&]*?\b(?:apply|destroy)\b/i },
  {
    name: "Kubernetes mutation or rollout",
    pattern: /\bkubectl\b[^\n;|&]*?\b(?:apply|replace|patch|delete|scale|rollout\b[^\n;|&]*?\b(?:restart|undo))\b/i,
  },
  { name: "Helm deployment mutation", pattern: /\bhelm\b[^\n;|&]*?\b(?:install|upgrade|uninstall|rollback)\b/i },
  {
    name: "container or volume pruning",
    pattern: /\bdocker\b[^\n;|&]*?\b(?:system|container|image|volume|network)\s+prune\b/i,
  },
  { name: "service restart or stop", pattern: /\b(?:systemctl\b[^\n;|&]*?\b(?:restart|stop)|service\s+\S+\s+(?:restart|stop))\b/i },
  { name: "reboot or shutdown", pattern: /\b(?:reboot|shutdown|poweroff|halt)\b/i },
  {
    name: "CBM index creation",
    pattern: /\bcodebase-memory-mcp\s+cli\s+(?:--\S+\s+)*index_repository\b/i,
  },
  {
    name: "CBM state deletion or mutation",
    pattern: /\bcodebase-memory-mcp\s+(?:uninstall\b|config\s+(?:set|reset)\b|cli\s+(?:--\S+\s+)*(?:delete_project|manage_adr|ingest_traces)\b)/i,
  },
];

function matchingRule(command: string, rules: Rule[]): Rule | undefined {
  return rules.find((rule) => rule.pattern.test(command));
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = event.input.command;
    if (typeof command !== "string") {
      return { block: true, reason: "Safety net blocked a bash call without a command string." };
    }

    const hardBlock = matchingRule(command, hardBlockRules);
    if (hardBlock) {
      return {
        block: true,
        reason: `Safety net blocked ${hardBlock.name}. Use a safe, narrowly scoped alternative.`,
      };
    }

    const confirmation = matchingRule(command, confirmationRules);
    if (!confirmation) return;

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `Safety net blocked ${confirmation.name} because this Pi session cannot request confirmation.`,
      };
    }

    const approved = await ctx.ui.confirm(
      "Safety confirmation required",
      `The agent requested ${confirmation.name}:\n\n${command}\n\nAllow this command to run?`,
    );

    if (!approved) {
      return { block: true, reason: "Safety net blocked the command because it was not confirmed." };
    }
  });
}
