import type { HistoryEntry } from "./types.js";

const EXTENDED_LINE = /^: (\d+):(\d+);(.*)$/s;

/**
 * Zsh writes either plain lines or, with EXTENDED_HISTORY, lines shaped like
 * `: <started>:<elapsed>;<command>`. A command spanning several lines has every
 * line but the last ending in a backslash, so those get joined back together.
 */
export function parseZshHistory(content: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const lines = content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index] ?? "";

    while (line.endsWith("\\") && index + 1 < lines.length) {
      index += 1;
      line = `${line.slice(0, -1)}\n${lines[index] ?? ""}`;
    }

    if (line.trim() === "") {
      continue;
    }

    const match = EXTENDED_LINE.exec(line);

    if (match) {
      const timestamp = Number.parseInt(match[1] ?? "", 10);
      const command = match[3] ?? "";

      if (command.trim() !== "") {
        entries.push({
          command,
          shell: "zsh",
          ...(Number.isFinite(timestamp) ? { timestamp } : {}),
        });
      }
      continue;
    }

    entries.push({ command: line, shell: "zsh" });
  }

  return entries;
}
