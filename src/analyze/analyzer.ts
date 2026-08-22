import type { Contract } from "../config/types";
import { walkSourceFiles } from "./walk";
import { filterViolationsByDiff, type DiffFileChanges } from "./diff";
import { EngineRegistry } from "../engine/registry";
import type { Violation, SourceFile } from "../engine/types";
import { consoleLogger, type Logger } from "../util/log";

let _registry: EngineRegistry | null = null;
function getRegistry(): EngineRegistry {
  if (!_registry) _registry = new EngineRegistry();
  return _registry;
}

/**
 * Filesystem-backed scan (used by CLI). Walks `root` and runs the
 * configured engines over every discovered source file.
 */
export async function analyze(
  root: string,
  contract: Contract,
  diffFilter?: DiffFileChanges,
  signal?: AbortSignal,
  logger: Logger = consoleLogger,
): Promise<Violation[]> {
  const files = walkSourceFiles(root);
  const violations = await runEngine(files, contract, signal, logger);
  if (diffFilter && Object.keys(diffFilter).length > 0) {
    return filterViolationsByDiff(violations, diffFilter);
  }
  return violations;
}

/**
 * In-memory scan (used by GitHub App and API). The engine is path-agnostic:
 * it only ever sees a list of { path, content }, so the source can be a
 * local file tree OR raw strings pulled straight from the GitHub API.
 */
export async function analyzeSources(
  sources: Record<string, string>,
  contract: Contract,
  diffFilter?: DiffFileChanges,
  signal?: AbortSignal,
  logger: Logger = consoleLogger,
): Promise<Violation[]> {
  const files: SourceFile[] = Object.entries(sources).map(([path, content]) => ({
    path: path.replace(/\\/g, "/").replace(/^\.\//, ""),
    content,
  }));
  const violations = await runEngine(files, contract, signal, logger);
  if (diffFilter && Object.keys(diffFilter).length > 0) {
    return filterViolationsByDiff(violations, diffFilter);
  }
  return violations;
}

async function runEngine(
  files: SourceFile[],
  contract: Contract,
  signal?: AbortSignal,
  logger: Logger = consoleLogger,
): Promise<Violation[]> {
  return getRegistry().run(files, contract, signal, logger);
}
