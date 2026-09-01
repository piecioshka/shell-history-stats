import { homedir } from "node:os";

import type { HistoryEntry } from "../history/types.js";

export interface PathStats {
  /** Entries that carried at least one path (fish only). */
  withPaths: number;
  totalEntries: number;
  coverage: number;
  directories: Array<{ directory: string; count: number }>;
}

/**
 * Fish records the paths mentioned by a command. Only a fraction of entries
 * have them, so coverage is reported next to the ranking.
 */
export function collectPathStats(
  entries: HistoryEntry[],
  home: string = homedir(),
): PathStats {
  const counts = new Map<string, number>();
  let withPaths = 0;

  for (const entry of entries) {
    const paths = entry.paths;
    if (!paths || paths.length === 0) {
      continue;
    }

    withPaths += 1;

    for (const path of paths) {
      const directory = normalizeDirectory(path, home);
      if (directory !== null) {
        counts.set(directory, (counts.get(directory) ?? 0) + 1);
      }
    }
  }

  return {
    withPaths,
    totalEntries: entries.length,
    coverage: entries.length === 0 ? 0 : withPaths / entries.length,
    directories: [...counts.entries()]
      .map(([directory, count]) => ({ directory, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Keeps only paths that look like real locations and shortens the home prefix,
 * so that the ranking is about places rather than individual file names.
 */
function normalizeDirectory(path: string, home: string): string | null {
  if (path === "" || path.startsWith("-")) {
    return null;
  }

  const withoutFile = path.includes("/")
    ? path.slice(0, path.lastIndexOf("/"))
    : path;
  if (withoutFile === "" || withoutFile === ".") {
    return null;
  }

  return withoutFile.startsWith(home)
    ? `~${withoutFile.slice(home.length)}`
    : withoutFile;
}
