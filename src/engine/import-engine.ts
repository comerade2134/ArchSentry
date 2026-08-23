import type { Rule } from "../config/types";
import type { RuleEngine, SourceFile, Violation } from "./types";
import { globToRegExp, matchesGlob } from "./pattern-engine";
import { mapWithConcurrency } from "../util/async";
import { consoleLogger, type Logger } from "../util/log";

/**
 * Dependency-boundary engine: enforces rules about which modules a file may
 * import. This is the piece line-pattern matching cannot do — it understands
 * ESM `import`, `export ... from`, CommonJS `require()`, and dynamic
 * `import()` specifiers, and can resolve relative specifiers to project paths
 * so boundaries like "controllers must not import repositories of other
 * domains" are expressible as plain path globs.
 */

export interface ImportRuleConfig {
  from: string[];
  forbid: string[];
  allow?: string[];
  exclude?: string[];
  regex?: boolean;
}

// One regex per import form; the specifier lives in capture group 1. Applied
// per line so the violating line number is known without offset math.
const IMPORT_FORMS = [
  /import\s+[^;]*?from\s*["']([^"']+)["']/, // import ... from "x"
  /import\s*["']([^"']+)["']/, // import "x"
  /export\s+[^;]*?from\s*["']([^"']+)["']/, // export ... from "x"
  /require\s*\(\s*["']([^"']+)["']\s*\)/, // require("x")
  /import\s*\(\s*["']([^"']+)["']\s*\)/, // import("x")
];

// Extract the specifier of the first import statement on a line, if any.
export function extractImportSpecifier(line: string): string | null {
  for (const re of IMPORT_FORMS) {
    const m = line.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

// Resolve a relative specifier against the importing file's directory,
// yielding a project-relative path (posix, no leading "./"). Non-relative
// specifiers are returned unchanged (bare imports are matched as-is).
export function resolveSpecifier(specifier: string, importerPath: string): string {
  if (!specifier.startsWith(".")) return specifier;
  const dirParts = importerPath.replace(/\\/g, "/").split("/").slice(0, -1);
  const resolvedParts = [...dirParts];
  for (const part of specifier.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") resolvedParts.pop();
    else resolvedParts.push(part);
  }
  return resolvedParts.join("/");
}

// Match an import target (path or bare specifier) against a pattern list.
// Patterns are globs (`**` crosses `/`, `*` does not) unless `regex` is true.
export function matchesAny(target: string, patterns: string[], regex: boolean): boolean {
  if (regex) return patterns.some((p) => new RegExp(p).test(target));
  return matchesGlob(target, patterns);
}

export function isForbidden(
  specifier: string,
  importerPath: string,
  cfg: ImportRuleConfig,
): boolean {
  const target = resolveSpecifier(specifier, importerPath);
  if (cfg.allow?.length && matchesAny(target, cfg.allow, cfg.regex === true)) return false;
  return matchesAny(target, cfg.forbid, cfg.regex === true);
}

export class ImportEngine implements RuleEngine {
  needsDisk = false;

  constructor(private readonly _logger: Logger = consoleLogger) {}

  supports(type: string): boolean {
    return type === "import";
  }

  async scan(files: SourceFile[], rule: Rule): Promise<Violation[]> {
    const cfg = rule.import;
    if (!cfg || !Array.isArray(cfg.forbid) || cfg.forbid.length === 0) return [];

    const severity = (rule.severity === "warn" ? "warn" : "error") as Violation["severity"];
    const fromGlobs = cfg.from?.length ? cfg.from : ["**/*"];

    const scanFile = async (file: SourceFile): Promise<Violation[]> => {
      if (!file || typeof file.content !== "string") return [];
      const normPath = file.path.replace(/\\/g, "/").replace(/^\.\//, "");
      if (!matchesGlob(normPath, fromGlobs)) return [];
      if (cfg.exclude?.length && matchesGlob(normPath, cfg.exclude)) return [];

      const out: Violation[] = [];
      const lines = file.content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        const specifier = extractImportSpecifier(line);
        if (specifier && isForbidden(specifier, normPath, cfg)) {
          out.push({
            ruleId: rule.id,
            severity,
            file: normPath,
            line: i + 1,
            snippet: line.trim(),
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

// Re-exported for tests: the glob translation shared with PatternEngine.
export { globToRegExp };
