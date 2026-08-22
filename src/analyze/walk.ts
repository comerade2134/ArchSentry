import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { extname, join, relative } from "node:path";
import type { SourceFile } from "../engine/types";
import { envInt } from "../util/env";
import { consoleLogger } from "../util/log";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "coverage",
  "vendor",
  ".venv",
  "venv",
  ".yarn",
  ".pnpm",
  "target",
  "bin",
  "obj",
  ".svelte-kit",
]);

const BINARY_OR_IGNORED_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".svg",
  ".webp",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".rar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
  ".map",
  ".lock",
]);

const MAX_WALK_DEPTH = 25;

export function walkSourceFiles(root: string): SourceFile[] {
  const out: SourceFile[] = [];
  const MAX_FILE_BYTES = envInt("ARCHSENTRY_MAX_FILE_BYTES", 512 * 1024, consoleLogger);

  const visit = (dir: string, depth = 0): void => {
    if (depth > MAX_WALK_DEPTH) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const abs = join(dir, entry);
      let st;
      try {
        st = lstatSync(abs);
      } catch {
        continue;
      }

      if (st.isSymbolicLink()) {
        continue;
      } else if (st.isDirectory()) {
        if (SKIP_DIRS.has(entry) || (entry.startsWith(".") && entry !== "." && entry !== "..")) {
          continue;
        }
        visit(abs, depth + 1);
      } else if (st.isFile()) {
        const ext = extname(entry).toLowerCase();
        if (BINARY_OR_IGNORED_EXTS.has(ext)) continue;
        if (typeof st.size === "number" && st.size > MAX_FILE_BYTES) continue;

        try {
          const content = readFileSync(abs, "utf8");
          const rel = relative(root, abs).replace(/\\/g, "/").replace(/^\.\//, "");
          out.push({ path: rel, content });
        } catch {
          // Inaccessible or unreadable file - continue safely
        }
      }
    }
  };

  visit(root);
  return out;
}
