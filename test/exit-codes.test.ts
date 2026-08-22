import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCli } from "../src/cli";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

describe("CLI Exit Codes Standard", () => {
  beforeEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("exits with code 0 on clean code scan", async () => {
    const tmpDir = join(process.cwd(), "test", ".tmp-clean");
    mkdirSync(tmpDir, { recursive: true });
    const cfgPath = join(tmpDir, "archsentry.yml");
    writeFileSync(
      cfgPath,
      "version: 1\nrules:\n  - id: no-eval\n    type: pattern\n    severity: error\n    description: no eval\n    match:\n      patterns: ['eval(']\n      paths: ['**/*.ts']\n",
    );
    const srcPath = join(tmpDir, "clean.ts");
    writeFileSync(srcPath, "export const safe = 123;\n");

    vi.spyOn(console, "log").mockImplementation(() => {});
    await buildCli().parseAsync(["scan", "-c", cfgPath, "-p", tmpDir], { from: "user" });

    expect(process.exitCode).toBe(0);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits with code 1 when architectural violations (error severity) are detected", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await buildCli().parseAsync(
      ["scan", "-c", "samples/dummy-target/archsentry.yml", "-p", "samples/dummy-target"],
      { from: "user" },
    );
    expect(process.exitCode).toBe(1);
  });

  it("exits with code 2 on internal runtime errors (e.g. missing config)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await buildCli().parseAsync(
      ["scan", "-c", "non-existent-config.yml", "-p", "samples/dummy-target"],
      { from: "user" },
    );
    expect(process.exitCode).toBe(2);
  });

  it("exits with code 2 on malformed YAML configuration", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await buildCli().parseAsync(
      ["scan", "-c", "package.json", "-p", "samples/dummy-target"],
      { from: "user" },
    );
    expect(process.exitCode).toBe(2);
  });
});
