export interface DiffFileChanges {
  [filePath: string]: Set<number>;
}

/**
 * Parses a unified diff string into a mapping of normalized file paths
 * to the set of line numbers that were added or modified in the target (new) file.
 *
 * Resilient against malformed diff headers, corrupted hunks, git binary diffs,
 * and truncated input.
 */
export function parseUnifiedDiff(diffText: string): DiffFileChanges {
  const result: DiffFileChanges = {};
  if (!diffText || typeof diffText !== "string") {
    return result;
  }

  const lines = diffText.split(/\r?\n/);
  let currentFile: string | null = null;
  let currentNewLine = 0;
  let inHunk = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;

    // Check for target file header (+++ b/path/to/file or +++ path/to/file)
    if (line.startsWith("+++ ")) {
      const rawPath = line.slice(4).trim();
      if (rawPath === "/dev/null") {
        currentFile = null;
        inHunk = false;
        continue;
      }

      // Strip "b/" prefix if standard git diff
      let cleanPath = rawPath;
      if (cleanPath.startsWith("b/")) {
        cleanPath = cleanPath.slice(2);
      } else if (cleanPath.startsWith('"b/') && cleanPath.endsWith('"')) {
        cleanPath = cleanPath.slice(3, -1);
      }

      // Normalize path slashes
      cleanPath = cleanPath.replace(/\\/g, "/").replace(/^\.\//, "");
      currentFile = cleanPath;
      inHunk = false;
      if (!result[currentFile]) {
        result[currentFile] = new Set<number>();
      }
      continue;
    }

    // Check for hunk header @@ -oldStart,oldLen +newStart,newLen @@
    if (line.startsWith("@@ ")) {
      inHunk = false;
      if (!currentFile) continue;

      const match = line.match(/^@@\s+-[0-9]+(?:,[0-9]+)?\s+\+([0-9]+)(?:,([0-9]+))?\s+@@/);
      if (match && match[1]) {
        const start = parseInt(match[1], 10);
        if (!isNaN(start)) {
          currentNewLine = start;
          inHunk = true;
        }
      }
      continue;
    }

    if (!inHunk || !currentFile) {
      continue;
    }

    // Inside a hunk
    if (line.startsWith("+")) {
      // Added line
      result[currentFile]?.add(currentNewLine);
      currentNewLine++;
    } else if (line.startsWith("-")) {
      // Deleted line does not advance line number in target file
      continue;
    } else if (line.startsWith(" ") || line === "") {
      // Context line
      currentNewLine++;
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file" - ignore
      continue;
    } else {
      // Encountered non-hunk line (corrupted or next diff section)
      inHunk = false;
    }
  }

  return result;
}

/**
 * Filter violations to only those occurring on added/modified lines in the diff.
 */
export function filterViolationsByDiff<T extends { file: string; line: number }>(
  violations: T[],
  diffMap: DiffFileChanges,
): T[] {
  const normMap: DiffFileChanges = {};
  for (const [p, lines] of Object.entries(diffMap)) {
    const norm = p.replace(/\\/g, "/").replace(/^\.\//, "");
    normMap[norm] = lines;
  }

  return violations.filter((v) => {
    const normFile = v.file.replace(/\\/g, "/").replace(/^\.\//, "");
    const changedLines = normMap[normFile];
    if (!changedLines) return false;
    return changedLines.has(v.line);
  });
}
