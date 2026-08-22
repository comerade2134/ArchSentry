import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, sep } from "node:path";
import { stringify } from "yaml";
import type { Rule } from "../config/types";
import type { RuleEngine, SourceFile, Violation } from "./types";
import { envInt } from "../util/env";
import { consoleLogger, type Logger } from "../util/log";

let _probe: Promise<boolean> | null = null;
export function probeSemgrep(): Promise<boolean> {
  if (!_probe) {
    _probe = new Promise<boolean>((resolveProbe) => {
      execFile("semgrep", ["--version"], (err) => resolveProbe(!err));
    });
  }
  return _probe;
}

export function resetSemgrepCache(): void {
  _probe = null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function toSemgrepRule(rule: Rule): Record<string, unknown> {
  const match = (rule.match ?? {}) as { patterns?: string[]; paths?: string[]; exclude?: string[] };
  const patterns = (match.patterns ?? []).filter((p) => typeof p === "string" && p.length > 0);
  const out: Record<string, unknown> = {
    id: rule.id,
    severity: rule.severity === "warn" ? "WARNING" : "ERROR",
    message: rule.description,
    languages: ["typescript", "javascript"],
    "pattern-regex": patterns.map(escapeRegex).join("|"),
  };
  const paths: Record<string, string[]> = {};
  if (match.paths && match.paths.length > 0) {
    paths.include = match.paths.map((p) => p.replace(/\\/g, "/"));
  }
  if (match.exclude && match.exclude.length > 0) {
    paths.exclude = match.exclude.map((p) => p.replace(/\\/g, "/"));
  }
  if (Object.keys(paths).length) out.paths = paths;
  return out;
}

export function safeJoin(dir: string, p: string): string | null {
  if (typeof p !== "string" || p.length === 0) return null;
  const root = resolve(dir);
  const abs = resolve(root, p);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

interface SemgrepResult {
  path: string;
  start: { line: number };
  extra: { message: string; lines?: string };
}

export class SemgrepEngine implements RuleEngine {
  needsDisk = true;

  private readonly logger: Logger;

  constructor(logger: Logger = consoleLogger) {
    this.logger = logger;
  }

  supports(type: string): boolean {
    return type === "semgrep";
  }

  async scan(
    files: SourceFile[],
    rule: Rule,
    baseDir?: string,
    signal?: AbortSignal,
  ): Promise<Violation[]> {
    let sgRule: Record<string, unknown>;
    if (rule.type === "pattern") {
      sgRule = toSemgrepRule(rule);
    } else {
      const native = rule.semgrep;
      if (!native) throw new Error(`Rule "${rule.id}" has type "semgrep" but no "semgrep" field.`);
      sgRule = {
        id: rule.id,
        severity: rule.severity === "warn" ? "WARNING" : "ERROR",
        message: rule.description,
        ...native,
      };
    }

    const ownDir = !baseDir;
    const dir = baseDir ?? mkdtempSync(join(tmpdir(), "archsentry-"));
    try {
      if (ownDir) {
        for (const f of files) {
          if (!f || typeof f.content !== "string") continue;
          const target = safeJoin(dir, f.path);
          if (!target) {
            this.logger.warn(`skipping unsafe path: ${f.path}`);
            continue;
          }
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, f.content, "utf8");
        }
      }

      const ruleFile = join(dir, "rule.yml");
      writeFileSync(ruleFile, stringify({ rules: [sgRule] }), "utf8");

      const stdout = await runSemgrep(ruleFile, dir, signal);
      let parsed: { results?: SemgrepResult[] } = {};
      try {
        parsed = JSON.parse(stdout || '{"results":[]}');
      } catch {
        parsed = { results: [] };
      }

      const normDir = dir.replace(/\\/g, "/");
      return (parsed.results ?? []).map((r) => {
        const p = r.path.replace(/\\/g, "/");
        const file = p.startsWith(normDir) ? p.slice(normDir.length).replace(/^\//, "") : p;
        return {
          ruleId: rule.id,
          severity: (rule.severity === "warn" ? "warn" : "error") as Violation["severity"],
          file: file.replace(/\\/g, "/").replace(/^\.\//, ""),
          line: r.start.line,
          snippet: (r.extra.lines ?? "").trim(),
          message: r.extra.message || rule.description,
        };
      });
    } finally {
      if (ownDir) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          // Temp dir cleanup safe ignore
        }
      }
    }
  }
}

const SEMGREP_TIMEOUT_MS = envInt("ARCHSENTRY_SEMGREP_TIMEOUT_MS", 120_000);

function runSemgrep(ruleFile: string, dir: string, signal?: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      "semgrep",
      ["scan", "--config", ruleFile, "--json", "--quiet", dir],
      { timeout: SEMGREP_TIMEOUT_MS, signal },
      (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException).code === "ETIMEDOUT") {
          reject(new Error(`Semgrep timed out after ${SEMGREP_TIMEOUT_MS}ms.`));
          return;
        }
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(
            new Error(
              "Semgrep is not installed. Install it with `pip install semgrep` or `uv tool install semgrep`.",
            ),
          );
          return;
        }
        if (err && !stdout) {
          reject(new Error(`Semgrep failed: ${(stderr || err.message).trim()}`));
          return;
        }
        resolve(stdout || "");
      },
    );
  });
}
