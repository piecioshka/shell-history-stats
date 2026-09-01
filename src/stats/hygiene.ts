import type { Invocation } from "../parse/invocation.js";

export interface TypoCandidate {
  typo: string;
  count: number;
  likelyMeant: string;
  targetCount: number;
}

export interface AliasCandidate {
  raw: string;
  count: number;
  length: number;
}

export interface HygieneStats {
  uniqueCommands: number;
  usedOnce: number;
  usedOnceRatio: number;
  averageLength: number;
  medianLength: number;
  longest: Array<{ raw: string; length: number }>;
  typoCandidates: TypoCandidate[];
  aliasCandidates: AliasCandidate[];
}

const TYPO_MAX_COUNT = 5;
const TYPO_MIN_TARGET_RATIO = 10;
/**
 * Two-letter names are excluded: one edit is half the word there, so real tools
 * (`nc`, `nl`, `du`) look like typos of each other.
 */
const TYPO_MIN_LENGTH = 3;
const ALIAS_MIN_COUNT = 5;
const ALIAS_MIN_LENGTH = 25;

/**
 * Short standard tools that keep getting matched against each other. Being on
 * this list only means "never call this a typo", not "ignore in statistics".
 */
const KNOWN_COMMANDS = new Set([
  "awk",
  "bat",
  "bun",
  "cal",
  "cat",
  "cd",
  "chmod",
  "chown",
  "cp",
  "curl",
  "cut",
  "date",
  "dd",
  "df",
  "diff",
  "dig",
  "dirname",
  "du",
  "echo",
  "env",
  "eza",
  "fd",
  "fg",
  "file",
  "find",
  "fish",
  "fzf",
  "gh",
  "git",
  "grep",
  "gzip",
  "head",
  "id",
  "jobs",
  "jq",
  "kill",
  "ln",
  "ls",
  "lsof",
  "man",
  "mkdir",
  "more",
  "mv",
  "nano",
  "nc",
  "net",
  "nl",
  "node",
  "npm",
  "nvm",
  "od",
  "open",
  "ping",
  "pnpm",
  "ps",
  "pwd",
  "python",
  "rg",
  "rm",
  "rmdir",
  "scp",
  "sed",
  "seq",
  "sh",
  "sort",
  "src",
  "ssh",
  "stat",
  "su",
  "sudo",
  "tac",
  "tail",
  "tar",
  "tee",
  "test",
  "time",
  "top",
  "touch",
  "tr",
  "tree",
  "uniq",
  "vi",
  "vim",
  "wc",
  "wget",
  "which",
  "who",
  "xargs",
  "yarn",
  "zsh",
]);

export function collectHygieneStats(
  invocations: Invocation[],
  options: { topLongest?: number; topTypos?: number; topAliases?: number } = {},
): HygieneStats {
  const { topLongest = 5, topTypos = 10, topAliases = 10 } = options;

  const commandCounts = new Map<string, number>();
  const rawCounts = new Map<string, number>();
  const lengths: number[] = [];

  for (const invocation of invocations) {
    commandCounts.set(
      invocation.command,
      (commandCounts.get(invocation.command) ?? 0) + 1,
    );
    rawCounts.set(invocation.raw, (rawCounts.get(invocation.raw) ?? 0) + 1);
    lengths.push(invocation.raw.length);
  }

  const usedOnce = [...commandCounts.values()].filter(
    (count) => count === 1,
  ).length;
  const sortedLengths = [...lengths].sort((a, b) => a - b);

  return {
    uniqueCommands: commandCounts.size,
    usedOnce,
    usedOnceRatio: commandCounts.size === 0 ? 0 : usedOnce / commandCounts.size,
    averageLength:
      lengths.length === 0
        ? 0
        : lengths.reduce((sum, length) => sum + length, 0) / lengths.length,
    medianLength: median(sortedLengths),
    longest: [...rawCounts.keys()]
      .map((raw) => ({ raw, length: raw.length }))
      .sort((a, b) => b.length - a.length)
      .slice(0, topLongest),
    typoCandidates: findTypoCandidates(commandCounts).slice(0, topTypos),
    aliasCandidates: findAliasCandidates(rawCounts).slice(0, topAliases),
  };
}

/**
 * A rare command one edit away from a much more frequent one is almost always a
 * typo (`gti` for `git`, `sl` for `ls`).
 */
export function findTypoCandidates(
  commandCounts: Map<string, number>,
): TypoCandidate[] {
  const frequent = [...commandCounts.entries()]
    .filter(([, count]) => count > TYPO_MAX_COUNT)
    .sort((a, b) => b[1] - a[1]);

  const candidates: TypoCandidate[] = [];

  for (const [command, count] of commandCounts) {
    if (count > TYPO_MAX_COUNT) continue;
    if (command.length < TYPO_MIN_LENGTH) continue;
    if (KNOWN_COMMANDS.has(command)) continue;

    for (const [target, targetCount] of frequent) {
      if (target === command) continue;
      if (targetCount < count * TYPO_MIN_TARGET_RATIO) continue;
      if (Math.abs(target.length - command.length) > 1) continue;

      if (editDistanceWithin(command, target, 1)) {
        candidates.push({
          typo: command,
          count,
          likelyMeant: target,
          targetCount,
        });
        break;
      }
    }
  }

  return candidates.sort((a, b) => b.count - a.count);
}

/** Long command lines typed often enough to be worth an alias. */
export function findAliasCandidates(
  rawCounts: Map<string, number>,
): AliasCandidate[] {
  return [...rawCounts.entries()]
    .filter(
      ([raw, count]) =>
        count >= ALIAS_MIN_COUNT && raw.length >= ALIAS_MIN_LENGTH,
    )
    .map(([raw, count]) => ({ raw, count, length: raw.length }))
    .sort((a, b) => b.count * b.length - a.count * a.length);
}

/**
 * Damerau-Levenshtein distance, asked only whether it stays within `limit`.
 * Transpositions count as one edit because most terminal typos are exactly
 * that: `gti` for `git`, `sl` for `ls`, `mkdri` for `mkdir`.
 */
export function editDistanceWithin(
  a: string,
  b: string,
  limit: number,
): boolean {
  if (Math.abs(a.length - b.length) > limit) {
    return false;
  }

  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (current[j - 1] as number) + 1,
        (previous[j] as number) + 1,
        (previous[j - 1] as number) + cost,
      );

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (beforePrevious[j - 2] as number) + 1);
      }

      current.push(value);
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > limit) {
      return false;
    }

    beforePrevious = previous;
    previous = current;
  }

  return (previous[b.length] as number) <= limit;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
    : (sorted[middle] as number);
}
