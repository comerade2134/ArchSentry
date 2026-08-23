import type { Rule } from "../config/types";
import type { RuleEngine, SourceFile, Violation } from "./types";
import { mapWithConcurrency } from "../util/async";
import { consoleLogger, type Logger } from "../util/log";

function toRegExp(patterns: string[], regex: boolean): RegExp | null {
  const valid = patterns.filter((p) => typeof p === "string" && p.length > 0);
  if (valid.length === 0) return null;
  const parts = valid.map((p) => (regex ? p : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  return new RegExp(parts.join("|"));
}

const MAX_GLOB_CACHE = 256;
const globCache = new Map<string, RegExp>();

export function globToRegExp(glob: string): RegExp {
  const cleanGlob = glob.replace(/\\/g, "/").replace(/^\.\//, "");
  const cached = globCache.get(cleanGlob);
  if (cached) return cached;

  let re = "";
  for (let i = 0; i < cleanGlob.length; i++) {
    const c = cleanGlob[i] as string;
    if (c === "*") {
      if (cleanGlob[i + 1] === "*") {
        if (cleanGlob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === ".") {
      re += "\\.";
    } else if ("+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  const result = new RegExp(`^${re}$`);
  if (globCache.size >= MAX_GLOB_CACHE) globCache.clear();
  globCache.set(cleanGlob, result);
  return result;
}

export function matchesGlob(filePath: string, globs: string[]): boolean {
  const norm = filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  return globs.some((g) => {
    if (!g || typeof g !== "string") return false;
    const cleanG = g.replace(/\\/g, "/").replace(/^\.\//, "");
    if (cleanG.startsWith("*.") && !cleanG.includes("/")) {
      return globToRegExp(`**/${cleanG}`).test(norm) || globToRegExp(cleanG).test(norm);
    }
    return globToRegExp(cleanG).test(norm);
  });
}

const DEFAULT_CODE_GLOBS = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"];

function inScope(file: SourceFile, rule: Rule): boolean {
  const norm = file.path.replace(/\\/g, "/").replace(/^\.\//, "");
  const match = (rule.match ?? {}) as { paths?: string[]; exclude?: string[] };
  const paths = match.paths && match.paths.length ? match.paths : DEFAULT_CODE_GLOBS;
  if (!matchesGlob(norm, paths)) return false;
  if (match.exclude && match.exclude.length && matchesGlob(norm, match.exclude)) return false;
  return true;
}

export class PatternEngine implements RuleEngine {
  needsDisk = false;

  constructor(private readonly _logger: Logger = consoleLogger) {}

  supports(type: string): boolean {
    return type === "pattern";
  }

  async scan(files: SourceFile[], rule: Rule): Promise<Violation[]> {
    const match = (rule.match ?? {}) as {
      patterns?: string[];
      regex?: boolean;
      multiline?: boolean;
    };
    const patterns = match.patterns ?? [];
    if (!Array.isArray(patterns) || !patterns.length) return [];

    const re = toRegExp(patterns, match.regex === true);
    if (!re) return [];

    const severity = (rule.severity === "warn" ? "warn" : "error") as Violation["severity"];

    const scanFile = async (file: SourceFile): Promise<Violation[]> => {
      if (!file || typeof file.content !== "string") return [];
      if (!inScope(file, rule)) return [];
      const lines = file.content.split(/\r?\n/);
      const normPath = file.path.replace(/\\/g, "/").replace(/^\.\//, "");

      // Multi-line mode: match against the whole file so constructs that span
      // lines (decorators + call, chained calls, block comments) are caught.
      // Each match is reported at the line it starts on.
      if (match.multiline === true) {
        const multilineRe = new RegExp(re.source, "gm");
        const out: Violation[] = [];
        for (const m of file.content.matchAll(multilineRe)) {
          const line = file.content.slice(0, m.index ?? 0).split(/\r?\n/).length;
          out.push({
            ruleId: rule.id,
            severity,
            file: normPath,
            line,
            snippet: (m[0] ?? "").trim().split(/\r?\n/)[0] ?? "",
            message: rule.description,
            remediation: rule.remediation,
          });
        }
        await Promise.resolve();
        return out;
      }

      const out: Violation[] = [];
      for (let i = 0; i < lines.length; i++) {
        const lineContent = lines[i] ?? "";
        if (re.test(lineContent)) {
          out.push({
            ruleId: rule.id,
            severity,
            file: normPath,
            line: i + 1,
            snippet: lineContent.trim(),
            message: rule.description,
            remediation: rule.remediation,
          });
        }
        if ((i & 0x3ff) === 0) await Promise.resolve();
      }
      return out;
    };

    const batches = await mapWithConcurrency(files, 16, scanFile);
    return batches.flat();
  }
}
