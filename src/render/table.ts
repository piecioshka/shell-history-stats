export type Align = "left" | "right";

export interface Column {
  header: string;
  align?: Align;
}

/** Renders a box-drawing table sized to its content. */
export function renderTable(columns: Column[], rows: string[][]): string {
  const widths = columns.map((column, index) =>
    Math.max(
      displayWidth(column.header),
      ...rows.map((row) => displayWidth(row[index] ?? "")),
    ),
  );

  const line = (left: string, middle: string, right: string): string =>
    left + widths.map((width) => "─".repeat(width + 2)).join(middle) + right;

  const renderRow = (cells: string[]): string =>
    "│ " +
    cells
      .map((cell, index) =>
        pad(cell, widths[index] ?? 0, columns[index]?.align ?? "left"),
      )
      .join(" │ ") +
    " │";

  return [
    line("┌", "┬", "┐"),
    renderRow(columns.map((column) => column.header)),
    line("├", "┼", "┤"),
    ...rows.map((row) => renderRow(row)),
    line("└", "┴", "┘"),
  ].join("\n");
}

/** Renders a GitHub-flavoured Markdown table. */
export function renderMarkdownTable(
  columns: Column[],
  rows: string[][],
): string {
  const header = `| ${columns.map((column) => column.header).join(" | ")} |`;
  const separator = `| ${columns
    .map((column) => (column.align === "right" ? "---:" : ":---"))
    .join(" | ")} |`;
  const body = rows.map(
    (row) => `| ${row.map((cell) => escapePipes(cell)).join(" | ")} |`,
  );

  return [header, separator, ...body].join("\n");
}

/** A compact inline bar, used for hour-of-day and weekday distributions. */
export function bar(value: number, max: number, width = 24): string {
  if (max <= 0) return "";
  const filled = Math.round((value / max) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

export function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * Report timestamps are stored as UTC but read by a person sitting in front of
 * the machine that produced them, so they are shown in local time - slicing the
 * ISO string instead would print UTC under a local-looking label.
 */
export function formatGeneratedAt(iso: string): string {
  const at = new Date(iso);
  const pad2 = (value: number) => String(value).padStart(2, "0");

  const date = `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`;
  const time = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`;

  return `${date} ${time}`;
}

export function truncate(text: string, max: number): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length <= max
    ? singleLine
    : `${singleLine.slice(0, max - 1)}…`;
}

function pad(text: string, width: number, align: Align): string {
  const padding = " ".repeat(Math.max(0, width - displayWidth(text)));
  return align === "right" ? padding + text : text + padding;
}

/** Counts wide CJK/emoji code points as two columns so borders stay aligned. */
function displayWidth(text: string): number {
  let width = 0;

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width +=
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0x1f300 && code <= 0x1f9ff)
        ? 2
        : 1;
  }

  return width;
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, "\\|");
}
