import { describe, it, expect } from "vitest";
import {
  ImportEngine,
  extractImportSpecifier,
  resolveSpecifier,
} from "../src/engine/import-engine";
import type { Rule } from "../src/config/types";
import type { SourceFile } from "../src/engine/types";

function importRule(partial: Partial<Rule> & { import: Rule["import"] }): Rule {
  return {
    id: "r",
    type: "import",
    severity: "error",
    description: "boundary",
    ...partial,
  } as Rule;
}

describe("extractImportSpecifier", () => {
  it.each([
    ['import { x } from "./a";', "./a"],
    ['import "./side-effect";', "./side-effect"],
    ['export * from "./b";', "./b"],
    ['const x = require("c");', "c"],
    ['const m = await import("d");', "d"],
    ['import type { T } from "./types";', "./types"],
    ['const s = "not an import";', null],
    ["// import fake from 'comment'", "comment"], // comments aren't parsed; documented limitation
  ])("%s -> %s", (line, expected) => {
    expect(extractImportSpecifier(line)).toBe(expected);
  });
});

describe("resolveSpecifier", () => {
  it("resolves relative specifiers against the importer directory", () => {
    expect(resolveSpecifier("../repositories/user", "src/controllers/user.controller.ts")).toBe(
      "src/repositories/user",
    );
    expect(resolveSpecifier("./util", "src/controllers/a.ts")).toBe("src/controllers/util");
    expect(resolveSpecifier("../../lib/x", "src/a/b/c.ts")).toBe("src/lib/x");
  });
  it("leaves bare specifiers unchanged", () => {
    expect(resolveSpecifier("react", "src/a.ts")).toBe("react");
    expect(resolveSpecifier("@scope/pkg/sub", "src/a.ts")).toBe("@scope/pkg/sub");
  });
});

describe("ImportEngine", () => {
  const engine = new ImportEngine();

  const files: SourceFile[] = [
    {
      path: "src/controllers/user.controller.ts",
      content: [
        'import { repo } from "../repositories/user.repository";',
        'import { helper } from "../utils/helper";',
        'import React from "react";',
      ].join("\n"),
    },
    {
      path: "src/services/auth.service.ts",
      content: 'import { repo } from "../repositories/user.repository";',
    },
  ];

  it("supports type import", () => {
    expect(engine.supports("import")).toBe(true);
    expect(engine.supports("pattern")).toBe(false);
  });

  it("flags forbidden imports only in `from` files", async () => {
    const rule = importRule({
      id: "no-repo-from-controllers",
      import: { from: ["src/controllers/**"], forbid: ["src/repositories/**"] },
    });
    const violations = await engine.scan(files, rule);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      ruleId: "no-repo-from-controllers",
      file: "src/controllers/user.controller.ts",
      line: 1,
      severity: "error",
    });
  });

  it("does not flag when import is in `allow`", async () => {
    const rule = importRule({
      import: {
        from: ["src/controllers/**"],
        forbid: ["src/repositories/**"],
        allow: ["src/repositories/user*"],
      },
    });
    expect(await engine.scan(files, rule)).toHaveLength(0);
  });

  it("matches bare specifiers as globs", async () => {
    const rule = importRule({ import: { from: ["src/**"], forbid: ["react"] } });
    const violations = await engine.scan(files, rule);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe("src/controllers/user.controller.ts");
    expect(violations[0]?.line).toBe(3);
  });

  it("supports regex forbid patterns", async () => {
    const rule = importRule({
      import: { from: ["src/**"], forbid: ["^react$"], regex: true },
    });
    expect(await engine.scan(files, rule)).toHaveLength(1);
  });

  it("honors exclude", async () => {
    const rule = importRule({
      import: {
        from: ["src/**"],
        forbid: ["src/repositories/**"],
        exclude: ["src/controllers/**"],
      },
    });
    // Only the services file (not excluded) import is flagged.
    expect(await engine.scan(files, rule)).toHaveLength(1);
    const violations = await engine.scan(files, rule);
    expect(violations[0]?.file).toBe("src/services/auth.service.ts");
  });

  it("applies to all files when `from` is omitted", async () => {
    const rule = importRule({ import: { from: [], forbid: ["src/repositories/**"] } });
    expect(await engine.scan(files, rule)).toHaveLength(2);
  });

  it("carries remediation onto violations", async () => {
    const rule = importRule({
      import: { from: ["src/**"], forbid: ["react"] },
      remediation: "Use the shared UI kit instead of React directly.",
    });
    const violations = await engine.scan(files, rule);
    expect(violations[0]?.remediation).toBe("Use the shared UI kit instead of React directly.");
  });

  it("returns nothing for rules without an import config", async () => {
    const rule = { id: "x", type: "import", description: "d" } as Rule;
    expect(await engine.scan(files, rule)).toHaveLength(0);
  });
});
