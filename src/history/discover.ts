import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { parseBashHistory } from "./bash.js";
import { parseFishHistory } from "./fish.js";
import type { HistoryEntry, HistorySource, ShellName } from "./types.js";
import { parseZshHistory } from "./zsh.js";

const PARSERS: Record<ShellName, (content: string) => HistoryEntry[]> = {
  fish: parseFishHistory,
  zsh: parseZshHistory,
  bash: parseBashHistory,
};

function fishDataDir(env: NodeJS.ProcessEnv, home: string): string {
  const xdg = env["XDG_DATA_HOME"];
  return xdg && xdg.trim() !== "" ? xdg : join(home, ".local", "share");
}

/**
 * Locates the history file of every supported shell. Missing files are simply
 * left out - most machines only have one or two of them.
 */
export function discoverHistorySources(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): HistorySource[] {
  const candidates: HistorySource[] = [
    {
      shell: "fish",
      file: join(fishDataDir(env, home), "fish", "fish_history"),
    },
    { shell: "zsh", file: join(home, ".zsh_history") },
    { shell: "bash", file: join(home, ".bash_history") },
  ];

  const histfile = env["HISTFILE"];
  if (
    histfile &&
    histfile.trim() !== "" &&
    !candidates.some((c) => c.file === histfile)
  ) {
    const shell = guessShellFromPath(histfile);
    if (shell) {
      candidates.unshift({ shell, file: histfile });
    }
  }

  return candidates.filter((candidate) => existsSync(candidate.file));
}

/**
 * Guesses which shell wrote a history file from its name, so that an explicit
 * `--file` (or $HISTFILE) still gets the right parser.
 */
export function guessShellFromPath(file: string): ShellName | null {
  const name = basename(file).toLowerCase();

  if (name.includes("fish")) return "fish";
  if (name.includes("zsh")) return "zsh";
  if (name.includes("bash") || name.includes("sh_history")) return "bash";

  return null;
}

/**
 * Recognises the format from the file itself, for an explicit `--file` whose
 * name says nothing. Both markers are checked over the first lines only, and
 * fish needs its `when:` line too - a bash history may well contain a one-off
 * command that starts with `- cmd:`.
 */
export function guessShellFromContent(content: string): ShellName {
  const head = content.split("\n", 50);

  if (
    head.some((line) => line.startsWith("- cmd: ")) &&
    head.some((line) => line.startsWith("  when: "))
  ) {
    return "fish";
  }

  if (head.some((line) => /^: \d+:\d+;/.test(line))) {
    return "zsh";
  }

  return "bash";
}

export function readHistorySource(source: HistorySource): HistoryEntry[] {
  const content = readFileSync(source.file, "utf8");
  return PARSERS[source.shell](content);
}

export function readHistorySources(sources: HistorySource[]): HistoryEntry[] {
  return sources.flatMap((source) => readHistorySource(source));
}
