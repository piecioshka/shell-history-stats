import type { HistoryEntry } from "./types.js";

/**
 * Fish history looks like YAML but is not valid YAML: a `\n` inside `cmd` is
 * two literal characters rather than a line break, and values are unquoted, so
 * anything containing a colon breaks a real YAML parser. Hence the hand-rolled
 * state machine below.
 */
export function parseFishHistory(content: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  let current: HistoryEntry | null = null;
  let inPaths = false;

  const flush = (): void => {
    if (current) {
      entries.push(current);
      current = null;
    }
    inPaths = false;
  };

  for (const line of content.split("\n")) {
    if (line.startsWith("- cmd: ")) {
      flush();
      current = {
        command: unescapeFishValue(line.slice("- cmd: ".length)),
        shell: "fish",
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("  when: ")) {
      const when = Number.parseInt(line.slice("  when: ".length).trim(), 10);
      if (Number.isFinite(when)) {
        current.timestamp = when;
      }
      inPaths = false;
      continue;
    }

    if (line.startsWith("  paths:")) {
      inPaths = true;
      current.paths = [];
      continue;
    }

    if (inPaths && line.startsWith("    - ")) {
      current.paths?.push(unescapeFishValue(line.slice("    - ".length)));
      continue;
    }

    inPaths = false;
  }

  flush();
  return entries;
}

function unescapeFishValue(value: string): string {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (char !== "\\") {
      result += char;
      continue;
    }

    const next = value[index + 1];
    if (next === "n") {
      result += "\n";
      index += 1;
    } else if (next === "t") {
      result += "\t";
      index += 1;
    } else if (next === "\\") {
      result += "\\";
      index += 1;
    } else {
      result += char;
    }
  }

  return result;
}
