import type { HistoryEntry } from "./types.js";

const TIMESTAMP_LINE = /^#(\d{9,})$/;

/**
 * Bash stores one command per line. With HISTTIMEFORMAT set it prefixes each
 * command with a `#<unix seconds>` line, so that shape is recognised but not
 * required.
 */
export function parseBashHistory(content: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  let pendingTimestamp: number | undefined;

  for (const line of content.split("\n")) {
    if (line.trim() === "") {
      continue;
    }

    const timestampMatch = TIMESTAMP_LINE.exec(line.trim());
    if (timestampMatch) {
      const parsed = Number.parseInt(timestampMatch[1] ?? "", 10);
      pendingTimestamp = Number.isFinite(parsed) ? parsed : undefined;
      continue;
    }

    entries.push({
      command: line,
      shell: "bash",
      ...(pendingTimestamp === undefined
        ? {}
        : { timestamp: pendingTimestamp }),
    });
    pendingTimestamp = undefined;
  }

  return entries;
}
