#!/usr/bin/env node
import { buildCli } from "./cli";

buildCli()
  .parseAsync(process.argv)
  .catch((err) => {
    console.error(`ArchSentry Fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
  });
