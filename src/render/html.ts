import type { Report } from "../stats/report.js";
import { percent, truncate } from "./table.js";

/**
 * A self-contained page: no external requests, no inline style attributes -
 * bar lengths are passed as a CSS custom property on each row.
 */
export function renderHtml(report: Report): string {
  // Sections are assembled first so the table of contents can be built from the
  // ones that actually made it in - an empty section must not get a TOC entry.
  const sections = [
    section(
      "Shells",
      table(
        ["Shell", "Entries", "Invocations", "Share"],
        report.shells.map((shell) => [
          shell.shell,
          String(shell.entries),
          String(shell.invocations),
          percent(shell.share),
        ]),
        [false, true, true, true],
      ),
    ),

    section(
      "Top commands",
      barTable(
        report.commands.map((command) => ({
          label: command.command,
          value: command.count,
          note: `${percent(command.bareRatio)} with no flags`,
        })),
      ),
    ),

    report.subcommands.length > 0
      ? section(
          "Top subcommands",
          barTable(
            report.subcommands.map((item) => ({
              label: `${item.command} ${item.subcommand}`,
              value: item.count,
              note: `${percent(item.bareRatio)} with no flags`,
            })),
          ),
        )
      : "",

    section(
      "Flags you actually use",
      report.flagsByCommand.map((command) => flagBlock(command)).join("\n"),
    ),

    temporalSection(report),

    report.paths.directories.length > 0
      ? section(
          "Busiest directories",
          `<p class="note">Based on ${report.paths.withPaths} of ${report.paths.totalEntries} entries (${percent(report.paths.coverage)}) that record paths - fish only.</p>` +
            barTable(
              report.paths.directories.map((item) => ({
                label: truncate(item.directory, 70),
                value: item.count,
              })),
            ),
        )
      : "",

    // Kept next to Hygiene, whose "Worth an alias" list is the other half of
    // the same story: which shorthands exist, and which are still missing.
    aliasSection(report),

    hygieneSection(report),
  ]
    .filter((html) => html !== "")
    .join("\n\n  ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shell history stats</title>
<style>
${STYLES}
</style>
</head>
<body>
<main class="page">
  <header class="header">
    <h1 class="title">Shell history stats</h1>
    <p class="subtitle">Generated ${escapeHtml(report.generatedAt.slice(0, 10))}</p>
  </header>

  <section class="cards">
    ${card("Entries", report.summary.entries.toLocaleString("en-US"))}
    ${card("Invocations", report.summary.invocations.toLocaleString("en-US"))}
    ${card("Unique commands", report.summary.uniqueCommands.toLocaleString("en-US"))}
    ${card("Ran with no flags", percent(report.summary.bareRatio))}
  </section>

  ${tableOfContents(sections)}

  ${sections}
</main>
</body>
</html>
`;
}

const STYLES = `:root {
  color-scheme: light dark;
  --bg: #fbfaf8;
  --fg: #1c1b19;
  --muted: #6b6862;
  --line: #e3e0d9;
  --panel: #ffffff;
  --accent: #b4623a;
  --bar: #dfd8cc;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16151a;
    --fg: #eceaf3;
    --muted: #9c98a8;
    --line: #2c2a33;
    --panel: #1d1c22;
    --accent: #e08b5e;
    --bar: #33313c;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 15px/1.55 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.page { max-width: 900px; margin: 0 auto; padding: 40px 20px 72px; }
.header { border-bottom: 2px solid var(--fg); padding-bottom: 16px; margin-bottom: 28px; }
.title { margin: 0; font-size: 30px; letter-spacing: -0.02em; }
.subtitle { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 36px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.card-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
.card-value { font-size: 24px; font-weight: 650; margin-top: 4px; font-variant-numeric: tabular-nums; }
.toc { margin: 0 0 36px; padding: 14px 18px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
.toc-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 8px; }
.toc-list { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 24px; }
.toc-list li { margin: 3px 0; break-inside: avoid; }
.toc-list a { color: var(--fg); text-decoration: none; font-size: 14px; border-bottom: 1px solid transparent; }
.toc-list a:hover { border-bottom-color: var(--accent); color: var(--accent); }
.section { margin-bottom: 36px; scroll-margin-top: 16px; }
.section-title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); border-bottom: 1px solid var(--line); padding-bottom: 6px; margin: 0 0 14px; }
.subsection-title { font-size: 15px; margin: 20px 0 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--accent); }
.note { color: var(--muted); font-size: 13px; margin: 0 0 12px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); }
th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
/* Fixed outer columns keep every track the same width across all sections;
   with fr/auto the label and value columns sized to their content instead. */
.bar-row { display: grid; grid-template-columns: 180px minmax(0, 1fr) 200px; gap: 12px; align-items: center; padding: 4px 0; }
.bar-label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { background: var(--bar); border-radius: 3px; height: 14px; overflow: hidden; justify-self: start; width: 100%; }
/* display:block matters: a span is inline by default and would ignore width. */
.bar-fill { display: block; background: var(--accent); height: 100%; width: calc(var(--pct) * 1%); border-radius: 3px; }
.bar-value { font-variant-numeric: tabular-nums; font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 640px) {
  .bar-row { grid-template-columns: 120px minmax(0, 1fr); }
  .bar-value { grid-column: 2; }
}
.overflow { overflow-x: auto; }`;

function card(label: string, value: string): string {
  return `<div class="card"><div class="card-label">${escapeHtml(label)}</div><div class="card-value">${escapeHtml(value)}</div></div>`;
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function section(title: string, body: string): string {
  return `<section class="section" id="${slug(title)}"><h2 class="section-title">${escapeHtml(title)}</h2>${body}</section>`;
}

/** Builds the table of contents from the sections that were actually rendered. */
function tableOfContents(html: string): string {
  const titles = [
    ...html.matchAll(/<h2 class="section-title">([^<]+)<\/h2>/g),
  ].map((match) => match[1] as string);

  if (titles.length < 2) {
    return "";
  }

  const items = titles
    .map((title) => `<li><a href="#${slug(title)}">${title}</a></li>`)
    .join("");

  return `<nav class="toc" aria-label="Contents"><p class="toc-title">Contents</p><ul class="toc-list">${items}</ul></nav>`;
}

function table(
  headers: string[],
  rows: string[][],
  numeric: boolean[] = [],
): string {
  const head = headers
    .map(
      (header, index) =>
        `<th${numeric[index] ? ' class="num"' : ""}>${escapeHtml(header)}</th>`,
    )
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, index) =>
              `<td${numeric[index] ? ' class="num"' : ""}>${escapeHtml(cell)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  return `<div class="overflow"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function barTable(
  items: Array<{ label: string; value: number; note?: string }>,
): string {
  const max = Math.max(...items.map((item) => item.value), 1);

  return items
    .map((item) => {
      const pct = ((item.value / max) * 100).toFixed(2);
      const note = item.note ? ` · ${item.note}` : "";
      return `<div class="bar-row"><span class="bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span><span class="bar-track"><span class="bar-fill" style="--pct:${pct}"></span></span><span class="bar-value">${item.value}${escapeHtml(note)}</span></div>`;
    })
    .join("");
}

function flagBlock(command: Report["flagsByCommand"][number]): string {
  const heading = `<h3 class="subsection-title">${escapeHtml(command.command)}</h3><p class="note">${command.count} runs · ${percent(command.bareRatio)} with no flags at all</p>`;

  if (command.flags.length === 0) {
    return `${heading}<p class="note">Never used a single flag.</p>`;
  }

  return (
    heading +
    table(
      ["Flag", "Count", "Of runs"],
      command.flags.map((flag) => [
        flag.flag,
        String(flag.count),
        percent(flag.share),
      ]),
      [false, true, true],
    )
  );
}

function aliasSection(report: Report): string {
  if (report.aliases.top.length === 0) {
    return "";
  }

  const note = `<p class="note">${report.aliases.used} of ${report.aliases.total} invocations (${percent(report.aliases.ratio)}) were typed as an alias.</p>`;

  const bars = barTable(
    report.aliases.top.map((alias) => ({
      label: alias.alias,
      value: alias.count,
      note: `→ ${alias.target}`,
    })),
  );

  return section("Most used aliases", note + bars);
}

function temporalSection(report: Report): string {
  const { temporal } = report;

  if (temporal.withTimestamp === 0) {
    return section(
      "When you work",
      '<p class="note">No timestamps found in any history file.</p>',
    );
  }

  const range = temporal.firstSeen
    ? ` Covers ${temporal.firstSeen} to ${temporal.lastSeen}.`
    : "";
  const note = `<p class="note">${temporal.withTimestamp} invocations have a timestamp; ${temporal.withoutTimestamp} do not and are excluded here.${escapeHtml(range)}</p>`;

  const hours = barTable(
    temporal.hours.map((hour) => ({
      label: `${String(hour.hour).padStart(2, "0")}:00`,
      value: hour.count,
    })),
  );
  const weekdays = barTable(
    temporal.weekdays.map((weekday) => ({
      label: weekday.label,
      value: weekday.count,
    })),
  );
  const months = barTable(
    temporal.months
      .slice(-12)
      .map((month) => ({ label: month.month, value: month.count })),
  );

  return section(
    "When you work",
    `${note}<h3 class="subsection-title">By hour</h3>${hours}<h3 class="subsection-title">By weekday</h3>${weekdays}<h3 class="subsection-title">Monthly trend</h3>${months}`,
  );
}

function hygieneSection(report: Report): string {
  const { hygiene } = report;
  const parts: string[] = [
    `<p class="note">Unique commands: <strong>${hygiene.uniqueCommands}</strong> · used exactly once: <strong>${hygiene.usedOnce}</strong> (${percent(hygiene.usedOnceRatio)}) · average length ${hygiene.averageLength.toFixed(1)} chars, median ${hygiene.medianLength}</p>`,
  ];

  if (hygiene.typoCandidates.length > 0) {
    parts.push(
      '<h3 class="subsection-title">Likely typos</h3>',
      table(
        ["Typed", "Times", "Probably meant", "Times"],
        hygiene.typoCandidates.map((typo) => [
          typo.typo,
          String(typo.count),
          typo.likelyMeant,
          String(typo.targetCount),
        ]),
        [false, true, false, true],
      ),
    );
  }

  if (hygiene.aliasCandidates.length > 0) {
    parts.push(
      '<h3 class="subsection-title">Worth an alias</h3>',
      table(
        ["Command", "Times", "Chars"],
        hygiene.aliasCandidates.map((candidate) => [
          truncate(candidate.raw, 70),
          String(candidate.count),
          String(candidate.length),
        ]),
        [false, true, true],
      ),
    );
  }

  return section("Hygiene", parts.join(""));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
