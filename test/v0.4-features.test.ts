import { describe, it, expect } from "vitest";
import { parseContract } from "../src/config/loader";
import { PatternEngine } from "../src/engine/pattern-engine";
import { TemplateExplainer, buildPrompt } from "../src/explain/llm";
import type { Rule } from "../src/config/types";
import type { SourceFile, Violation } from "../src/engine/types";

describe("v0.4 config: import rules + remediation", () => {
  it("parses a valid import rule", () => {
    const c = parseContract(`
version: 1
rules:
  - id: no-repo-in-controllers
    type: import
    description: Controllers must not import repositories
    remediation: Inject the repository via a service instead.
    import:
      from: ["src/controllers/**"]
      forbid: ["src/repositories/**"]
      allow: ["src/repositories/index*"]
`);
    expect(c.rules[0]?.type).toBe("import");
    expect(c.rules[0]?.import?.forbid).toEqual(["src/repositories/**"]);
    expect(c.rules[0]?.remediation).toBe("Inject the repository via a service instead.");
  });

  it("rejects an import rule without forbid", () => {
    expect(() =>
      parseContract(`
version: 1
rules:
  - id: bad
    type: import
    description: d
    import:
      from: ["src/**"]
`),
    ).toThrow(/import\.forbid/);
  });

  it("rejects a non-string remediation", () => {
    expect(() =>
      parseContract(`
version: 1
rules:
  - id: bad
    type: pattern
    description: d
    remediation: 42
    match:
      patterns: ["x"]
`),
    ).toThrow(/remediation/);
  });

  it("rejects a non-boolean match.multiline", () => {
    expect(() =>
      parseContract(`
version: 1
rules:
  - id: bad
    type: pattern
    description: d
    match:
      patterns: ["x"]
      multiline: "yes"
`),
    ).toThrow(/multiline/);
  });
});

describe("PatternEngine multiline", () => {
  const engine = new PatternEngine();
  const files: SourceFile[] = [
    {
      path: "src/a.ts",
      content: 'const ok = 1;\nawait fetch(\n  "https://api.example.com",\n);',
    },
  ];

  it("matches constructs spanning lines when multiline is on", async () => {
    const rule = {
      id: "no-fetch",
      type: "pattern",
      description: "no fetch",
      match: { patterns: ["fetch("], multiline: true },
    } as Rule;
    // fetch( is on line 2
    const violations = await engine.scan(files, rule);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.line).toBe(2);
  });

  it("reports each match at its starting line", async () => {
    const rule = {
      id: "multi",
      type: "pattern",
      description: "d",
      match: { patterns: ["TODO:"], multiline: true },
    } as Rule;
    const f: SourceFile[] = [{ path: "a.ts", content: "TODO: one\nx\nTODO: two" }];
    const violations = await engine.scan(f, rule);
    expect(violations.map((v) => v.line)).toEqual([1, 3]);
  });
});

describe("remediation-aware explainers", () => {
  const v: Violation = {
    ruleId: "r1",
    severity: "error",
    file: "a.ts",
    line: 1,
    snippet: "foo",
    message: "no direct db",
    remediation: "Use the repository layer.",
  };

  it("buildPrompt includes remediation guidance", () => {
    const prompt = buildPrompt(v, "code");
    expect(prompt).toContain("remediation guidance");
    expect(prompt).toContain("Use the repository layer.");
  });

  it("buildPrompt omits the guidance block when absent", () => {
    const { remediation, ...without } = v;
    void remediation;
    expect(buildPrompt(without, "code")).not.toContain("remediation guidance");
  });

  it("TemplateExplainer prefers rule remediation", async () => {
    expect(await new TemplateExplainer().explain(v)).toBe("no direct db Use the repository layer.");
  });
});
