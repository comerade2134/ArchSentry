export type Severity = "error" | "warn";

export interface PatternMatch {
  patterns: string[];
  // When true, `patterns` are treated as real RegExp (author owns any ReDoS
  // risk, audit P3-2). Default false → patterns are matched literally (and
  // regex-special chars are escaped), which is safe and the common case.
  regex?: boolean;
  // When true, patterns match across the whole file (multi-line constructs)
  // instead of line-by-line; each match is reported at its first line.
  multiline?: boolean;
  paths?: string[];
  exclude?: string[];
}

// Dependency-boundary rule: files matching `from` may not import targets
// matching `forbid` (unless they match `allow`). Relative specifiers are
// resolved to project-relative paths before matching, so boundaries are
// expressible as plain path globs.
export interface ImportMatch {
  from: string[];
  forbid: string[];
  allow?: string[];
  exclude?: string[];
  // When true, `forbid`/`allow` are real RegExp instead of globs.
  regex?: boolean;
}

export interface Rule {
  id: string;
  type: "pattern" | "semgrep" | "import";
  severity?: Severity;
  description: string;
  // Optional author-provided fix guidance. Shown in reports verbatim and used
  // as ground truth by the AI explainer.
  remediation?: string;
  // For `pattern` rules: the regex patterns + optional path scoping.
  match?: PatternMatch;
  // For `import` rules: the dependency boundary to enforce.
  import?: ImportMatch;
  // For `semgrep` rules: a raw Semgrep rule body (pattern / patterns /
  // pattern-either / etc.). Typed as an open map because Semgrep's schema is
  // large and versioned; the loader validates the shape at config-parse time.
  semgrep?: Record<string, unknown>;
}

export interface Contract {
  version: number;
  rules: Rule[];
}
