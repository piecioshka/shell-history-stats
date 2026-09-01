import type { HistoryEntry, ShellName } from "../history/types.js";
import { expandAlias, type AliasTable } from "./aliases.js";
import { splitSegments } from "./segments.js";
import { stripKeywords, unwrap } from "./wrappers.js";

/** Commands whose first non-flag token is a subcommand worth counting. */
export const MULTITOOLS = new Set([
  "git",
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "docker",
  "podman",
  "kubectl",
  "brew",
  "cargo",
  "gh",
  "go",
  "apt",
  "apt-get",
  "systemctl",
  "terraform",
  "aws",
  "gcloud",
  "railway",
  "vercel",
  "fisher",
  "nvm",
  "pip",
  "pip3",
  "poetry",
  "composer",
  "make",
  "deno",
]);

export interface Invocation {
  shell: ShellName;
  timestamp?: number;
  command: string;
  subcommand?: string;
  flags: string[];
  argCount: number;
  wrappers: string[];
  /** Set when the typed command was an alias, e.g. `gc` for `git commit -v`. */
  alias?: string;
  /** The command (and subcommand) the alias itself expands to. */
  aliasTarget?: string;
  raw: string;
}

/** Turns one history entry into one invocation per pipeline segment. */
export function parseEntry(
  entry: HistoryEntry,
  aliases?: AliasTable,
): Invocation[] {
  const invocations: Invocation[] = [];

  for (const segment of splitSegments(entry.command)) {
    const invocation = buildInvocation(segment, entry, aliases);
    if (invocation) {
      invocations.push(invocation);
    }
  }

  return invocations;
}

export function parseEntries(
  entries: HistoryEntry[],
  aliases?: AliasTable,
): Invocation[] {
  return entries.flatMap((entry) => parseEntry(entry, aliases));
}

function buildInvocation(
  segment: string[],
  entry: HistoryEntry,
  aliases?: AliasTable,
): Invocation | null {
  const withoutKeywords = stripKeywords(segment);
  if (withoutKeywords.length === 0) {
    return null;
  }

  const unwrapped = unwrap(withoutKeywords);
  const wrappers = [...unwrapped.wrappers];

  // Aliases are expanded after wrappers so that `sudo ll` resolves too, and the
  // result is unwrapped again in case the alias itself starts with a wrapper.
  const expansion = aliases
    ? expandAlias(unwrapped.tokens, aliases)
    : { tokens: unwrapped.tokens };
  const aliasName =
    expansion.expandedFrom !== undefined &&
    expansion.tokens !== unwrapped.tokens
      ? expansion.expandedFrom
      : undefined;

  let tokens = expansion.tokens;
  if (aliasName !== undefined) {
    const reUnwrapped = unwrap(tokens);
    tokens = reUnwrapped.tokens;
    wrappers.push(...reUnwrapped.wrappers);
  }

  const command = tokens[0];

  if (command === undefined || command === "" || !isPlausibleCommand(command)) {
    return null;
  }

  // An alias that only adds flags to its own name (`grep='grep --color'`) is not
  // a shorthand worth reporting - the user typed the command itself.
  const reportedAlias = aliasName === command ? undefined : aliasName;

  // Only the tokens contributed by the alias describe what it expands to; the
  // rest were typed by hand. Without this `g build` would look like `g -> git build`.
  const aliasTarget =
    reportedAlias === undefined
      ? undefined
      : describeAliasTarget(tokens, expansion.aliasTokenCount);

  const flags: string[] = [];
  let subcommand: string | undefined;
  let argCount = 0;

  for (const token of tokens.slice(1)) {
    if (isFlag(token)) {
      flags.push(flagName(token));
      continue;
    }

    if (
      subcommand === undefined &&
      MULTITOOLS.has(command) &&
      isPlausibleSubcommand(token)
    ) {
      subcommand = token;
      continue;
    }

    argCount += 1;
  }

  return {
    shell: entry.shell,
    ...(entry.timestamp === undefined ? {} : { timestamp: entry.timestamp }),
    command,
    ...(subcommand === undefined ? {} : { subcommand }),
    flags,
    argCount,
    wrappers,
    ...(reportedAlias === undefined ? {} : { alias: reportedAlias }),
    ...(aliasTarget === undefined ? {} : { aliasTarget }),
    raw: withoutKeywords.join(" "),
  };
}

export function isFlag(token: string): boolean {
  return token.length > 1 && token.startsWith("-") && token !== "--";
}

/** `--out=report.md` and `--out report.md` should both count as `--out`. */
export function flagName(token: string): string {
  const equals = token.indexOf("=");
  return equals === -1 ? token : token.slice(0, equals);
}

/**
 * Filters out things that are clearly not command names: paths with slashes are
 * kept (they are real commands), but bare option values and substitutions are not.
 */
function isPlausibleCommand(token: string): boolean {
  if (token.startsWith("-")) return false;
  if (token.startsWith("$") || token.startsWith("`") || token.startsWith("("))
    return false;
  if (token.includes("=")) return false;
  return true;
}

/**
 * Describes what an alias stands for, as `command` or `command subcommand`.
 * Only tokens the alias itself contributed are considered, and its baked-in
 * arguments are left out: `f` is reported as `find`, not as the whole
 * find invocation with its exclude patterns.
 */
function describeAliasTarget(tokens: string[], aliasTokenCount = 1): string {
  const fromAlias = tokens.slice(0, Math.max(1, aliasTokenCount));
  const command = fromAlias[0] ?? "";

  if (!MULTITOOLS.has(command)) {
    return command;
  }

  const subcommand = fromAlias
    .slice(1)
    .find((token) => !isFlag(token) && isPlausibleSubcommand(token));

  return subcommand === undefined ? command : `${command} ${subcommand}`;
}

function isPlausibleSubcommand(token: string): boolean {
  if (token.startsWith("$") || token.startsWith("`")) return false;
  if (token.includes("/") || token.includes(".")) return false;
  return /^[A-Za-z][A-Za-z0-9:_-]*$/.test(token);
}
