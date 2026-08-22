import { Command } from "commander";
import pkg from "../package.json";
import { loadContract, ConfigError } from "./config/loader";
import { analyze } from "./analyze/analyzer";
import { parseUnifiedDiff, type DiffFileChanges } from "./analyze/diff";
import { formatReport, type Format } from "./report/formatter";
import { attachExplanations, diskContext } from "./service/scan";
import { readFileSync } from "node:fs";

async function readStdin(): Promise<string> {
  return new Promise<string>((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    if (process.stdin.isTTY) {
      resolve("");
    }
  });
}

export function buildCli(): Command {
  const program = new Command();

  program
    .name("archsentry")
    .description("Enforce your team's architectural rules on code before merge.")
    .version(pkg.version);

  program
    .command("scan")
    .description("Scan a path against an archsentry.yml contract.")
    .option("-c, --config <file>", "path to archsentry.yml", "archsentry.yml")
    .option("-p, --path <dir>", "directory to scan", ".")
    .option("-f, --format <format>", "output format: text | json", "text")
    .option("-d, --diff <file>", "filter findings to lines modified in a unified diff file (use '-' for stdin)")
    .option("-e, --explain", "attach an AI/LLM explanation to each violation", false)
    .option("-s, --severity <level>", "minimum severity to report: error | warn", "warn")
    .option("--no-fail", "report only — never exit non-zero, even on errors")
    .action(async (opts) => {
      try {
        const configPath = opts.config as string;
        const targetPath = opts.path as string;
        const format = (opts.format as Format) ?? "text";

        const contract = loadContract(configPath);

        let diffFilter: DiffFileChanges | undefined;
        if (opts.diff) {
          let diffContent = "";
          if (opts.diff === "-") {
            diffContent = await readStdin();
          } else {
            diffContent = readFileSync(opts.diff as string, "utf8");
          }
          diffFilter = parseUnifiedDiff(diffContent);
        }

        const violations = await analyze(targetPath, contract, diffFilter);
        const explained = await attachExplanations(
          violations,
          diskContext(targetPath),
          opts.explain as boolean,
        );

        const reported =
          (opts.severity as string) === "error"
            ? explained.filter((v) => v.severity === "error")
            : explained;

        console.log(formatReport(reported, format));

        const hasError = violations.some((v) => v.severity === "error");
        if (hasError && opts.fail !== false) {
          process.exitCode = 1;
        } else {
          process.exitCode = 0;
        }
      } catch (err) {
        const message = err instanceof ConfigError ? err.message : (err as Error).message;
        console.error(`ArchSentry Error: ${message}`);
        process.exitCode = 2;
      }
    });

  return program;
}
