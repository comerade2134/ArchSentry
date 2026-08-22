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
    return "✅ ArchSentry: 0 violations found. Architecture contract satisfied.";
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
      let line = `- **${escapeHtml(v.ruleId)}** (${escapeHtml(v.severity)}) in \`${escapeHtml(v.file)}:${v.line}\` — ${escapeHtml(v.message)}\n  \`${escapeHtml(v.snippet)}\``;
      if (v.explanation) {
        line += `\n\n  > **💡 Remediation:** ${escapeHtml(v.explanation)}`;
      }
      return line;
    })
    .join("\n\n");

  return `### 🛡️ ArchSentry — Architectural Rule Violations\n\n${body}\n\n---\n*Enforced deterministically by [ArchSentry](https://github.com/comerade2134/archsentry). Fix the flagged lines or update \`archsentry.yml\`.*`;
}
