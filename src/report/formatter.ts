import type { Violation } from "../engine/types";

export type Format = "text" | "json";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

export function formatReport(violations: Violation[], format: Format): string {
  if (format === "json") {
    return JSON.stringify({ violations, total: violations.length }, null, 2);
  }
  if (violations.length === 0) {
    return "✅ ArchSentry: no rule violations found.";
  }

  const errors = violations.filter((v) => v.severity === "error").length;
  const warnings = violations.filter((v) => v.severity === "warn").length;

  const lines: string[] = [];
  lines.push(
    `❌ ArchSentry found ${violations.length} violation(s) (${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}):\n`,
  );

  for (const v of violations) {
    const badge = v.severity === "error" ? "[error]" : "[warn]";
    lines.push(`  • ${badge} ${v.ruleId}  ${v.file}:${v.line}`);
    lines.push(`    ${v.message}`);
    lines.push(`    > ${v.snippet}`);
    if (v.explanation) {
      lines.push(`    💡 Remediation: ${v.explanation}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function toPrComment(violations: Violation[]): string {
  if (violations.length === 0) {
    return "✅ ArchSentry: no architectural-rule violations detected.";
  }

  const body = violations
    .map((v) => {
      const head = `- \`${escapeHtml(v.ruleId)}\` (${escapeHtml(v.severity)}) in \`${escapeHtml(v.file)}:${v.line}\`\n`;
      const msg = v.message ? `  \`\`\`\n${escapeHtml(v.message)}\n  \`\`\`\n` : "";
      const snip = v.snippet ? `  \`\`\`\n${escapeHtml(v.snippet)}\n  \`\`\`\n` : "";
      const exp = v.explanation ? `  \`\`\`\n${escapeHtml(v.explanation)}\n  \`\`\`\n` : "";
      return head + msg + snip + exp;
    })
    .join("\n");

  return `### ArchSentry — Architectural Rule Violations\n\n${body}\n\n> Fix the flagged lines or update \`archsentry.yml\`.`;
}
