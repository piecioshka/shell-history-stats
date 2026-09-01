import { execFileSync } from "node:child_process";

import type { ShellName } from "../history/types.js";

export type AliasTable = Map<string, string>;

/**
 * Aliases cannot be read reliably from rc files: plugin frameworks such as
 * oh-my-zsh define most of them at load time. Asking a real interactive shell
 * for its own alias table is the only source of truth.
 */
export function loadAliases(shell: ShellName): AliasTable {
  try {
    const output = runShell(shell);
    return shell === "fish"
      ? parseFishAliases(output)
      : parsePosixAliases(output);
  } catch {
    return new Map();
  }
}

export function loadAllAliases(shells: readonly ShellName[]): AliasTable {
  const table: AliasTable = new Map();

  for (const shell of shells) {
    for (const [name, target] of loadAliases(shell)) {
      if (!table.has(name)) {
        table.set(name, target);
      }
    }
  }

  return table;
}

function runShell(shell: ShellName): string {
  const args = shell === "fish" ? ["-c", "alias"] : ["-ic", "alias"];

  return execFileSync(shell, args, {
    encoding: "utf8",
    timeout: 10_000,
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 4 * 1024 * 1024,
  });
}

/** Parses `name='value'` lines as printed by bash and zsh. */
export function parsePosixAliases(output: string): AliasTable {
  const table: AliasTable = new Map();

  for (const rawLine of output.split("\n")) {
    const line = rawLine.startsWith("alias ")
      ? rawLine.slice("alias ".length)
      : rawLine;
    const match = /^([A-Za-z0-9_.:-]+)=(.*)$/.exec(line.trim());

    if (match) {
      const name = match[1] as string;
      const target = stripQuotes(match[2] as string);
      if (target !== "") {
        table.set(name, target);
      }
    }
  }

  return table;
}

/** Parses `alias name value` / `alias name 'value'` lines as printed by fish. */
export function parseFishAliases(output: string): AliasTable {
  const table: AliasTable = new Map();

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("alias ")) {
      continue;
    }

    const rest = line.slice("alias ".length).trim();
    const match = /^([A-Za-z0-9_.:-]+)[ =](.*)$/.exec(rest);

    if (match) {
      const name = match[1] as string;
      const target = stripQuotes((match[2] as string).trim());
      if (target !== "") {
        table.set(name, target);
      }
    }
  }

  return table;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      // Shells print embedded single quotes as '\'' - undo that too.
      return trimmed.slice(1, -1).replace(/'\\''/g, "'");
    }
  }

  return trimmed;
}

/**
 * Expands an alias into its target tokens, following chains such as
 * `gc -> git commit -v`. Self-referencing and cyclic aliases stop the walk.
 */
export function expandAlias(
  tokens: string[],
  aliases: AliasTable,
  maxDepth = 10,
): { tokens: string[]; expandedFrom?: string } {
  const head = tokens[0];
  if (head === undefined || !aliases.has(head)) {
    return { tokens };
  }

  const seen = new Set<string>();
  let current = [...tokens];
  const original = head;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const name = current[0];
    if (name === undefined || !aliases.has(name) || seen.has(name)) {
      break;
    }

    seen.add(name);
    const target = aliases.get(name) as string;
    const targetTokens = target.split(/\s+/).filter((token) => token !== "");

    if (targetTokens.length === 0 || targetTokens[0] === name) {
      break;
    }

    current = [...targetTokens, ...current.slice(1)];
  }

  return { tokens: current, expandedFrom: original };
}
