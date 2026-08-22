import { describe, it, expect, vi } from "vitest";
import { PatternEngine, matchesGlob } from "../src/engine/pattern-engine";
import { parseContract, ConfigError } from "../src/config/loader";
import { SemgrepEngine } from "../src/engine/semgrep";
import type { Rule } from "../src/config/types";
import type { SourceFile } from "../src/engine/types";

describe("Edge cases & Malicious inputs", () => {
  it("warns on duplicate rule IDs in config", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const yaml = `
version: 1
rules:
  - id: rule-one
    type: pattern
    description: first
    match:
      patterns: ["foo"]
  - id: rule-one
    type: pattern
    description: duplicate
    match:
      patterns: ["bar"]
`;
    const contract = parseContract(yaml);
    expect(contract.rules).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('duplicate rule id "rule-one"'));
    warnSpy.mockRestore();
  });

  it("rejects rule with unsupported type", () => {
    const yaml = `
version: 1
rules:
  - id: bad-type
    type: malicious_exec
    description: bad
`;
    expect(() => parseContract(yaml)).toThrow(ConfigError);
    expect(() => parseContract(yaml)).toThrow(/unsupported type/);
  });

  it("handles Windows backslashes in paths properly", async () => {
    const files: SourceFile[] = [
      {
        path: "src\\controllers\\user.controller.ts",
        content: "const query = 'SELECT * FROM users';",
      },
    ];

    const rule: Rule = {
      id: "no-sql",
      type: "pattern",
      severity: "error",
      description: "No SQL in controllers",
      match: {
        patterns: ["SELECT *"],
        paths: ["src/controllers/**"],
      },
    };

    const engine = new PatternEngine();
    const violations = await engine.scan(files, rule);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe("src/controllers/user.controller.ts");
  });

  it("handles nested directory creation in SemgrepEngine without ENOENT error", async () => {
    const engine = new SemgrepEngine();
    const rule: Rule = {
      id: "no-eval",
      type: "pattern",
      severity: "error",
      description: "No eval",
      match: {
        patterns: ["eval("],
      },
    };

    const files: SourceFile[] = [
      {
        path: "deep/nested/directory/structure/file.ts",
        content: "const safe = 1;",
      },
    ];

    if (engine.supports("pattern")) {
      const violations = await engine.scan(files, rule);
      expect(violations).toHaveLength(0);
    }
  });

  it("matches diverse glob patterns correctly", () => {
    expect(matchesGlob("src/controllers/user.controller.ts", ["src/controllers/**"])).toBe(true);
    expect(matchesGlob("src/controllers/user.controller.ts", ["**/*.ts"])).toBe(true);
    expect(matchesGlob("src/controllers/user.controller.ts", ["*.ts"])).toBe(true);
    expect(matchesGlob("src/repositories/user.repository.ts", ["src/controllers/**"])).toBe(false);
    expect(matchesGlob("src/db/migrations/1.sql", ["**/migrations/*.sql"])).toBe(true);
  });
});
