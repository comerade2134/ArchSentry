import { describe, it, expect } from "vitest";
import { parseUnifiedDiff, filterViolationsByDiff } from "../src/analyze/diff";

describe("parseUnifiedDiff", () => {
  it("parses standard git diff with added and context lines", () => {
    const rawDiff = `
--- a/src/controllers/user.controller.ts
+++ b/src/controllers/user.controller.ts
@@ -5,3 +5,4 @@
 import { db } from "../db";
+await db.query("INSERT INTO users VALUES ($1)", [id]);
 const x = 1;
`;
    const res = parseUnifiedDiff(rawDiff);
    expect(res["src/controllers/user.controller.ts"]).toBeDefined();
    expect(res["src/controllers/user.controller.ts"]?.has(6)).toBe(true);
    expect(res["src/controllers/user.controller.ts"]?.has(5)).toBe(false);
  });

  it("handles new files created (from /dev/null)", () => {
    const rawDiff = `
--- /dev/null
+++ b/src/services/auth.ts
@@ -0,0 +1,3 @@
+export function login() {
+  return true;
+}
`;
    const res = parseUnifiedDiff(rawDiff);
    expect(res["src/services/auth.ts"]).toBeDefined();
    expect(res["src/services/auth.ts"]?.has(1)).toBe(true);
    expect(res["src/services/auth.ts"]?.has(2)).toBe(true);
    expect(res["src/services/auth.ts"]?.has(3)).toBe(true);
  });

  it("handles corrupted or truncated diff headers gracefully without crashing", () => {
    const corrupted = `
@@ invalid hunk header @@
+++ 
random garbage text
--- a/broken
+++ b/valid.ts
@@ -10,2 +10,2 @@
-old line
+new line
`;
    const res = parseUnifiedDiff(corrupted);
    expect(res["valid.ts"]).toBeDefined();
    expect(res["valid.ts"]?.has(10)).toBe(true);
  });

  it("handles empty or non-string diff gracefully", () => {
    expect(parseUnifiedDiff("")).toEqual({});
    expect(parseUnifiedDiff(null as unknown as string)).toEqual({});
  });
});

describe("filterViolationsByDiff", () => {
  it("filters out violations on unmodified lines", () => {
    const violations = [
      { file: "src/user.ts", line: 5, ruleId: "r1", message: "m" },
      { file: "src/user.ts", line: 12, ruleId: "r1", message: "m" },
      { file: "src/other.ts", line: 1, ruleId: "r1", message: "m" },
    ];
    const diffMap = {
      "src/user.ts": new Set([12, 13, 14]),
    };
    const filtered = filterViolationsByDiff(violations, diffMap);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.line).toBe(12);
  });
});
