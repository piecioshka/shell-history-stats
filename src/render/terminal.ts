import type { Report } from "../stats/report.js";
import {
  bar,
  formatGeneratedAt,
  percent,
  renderTable,
  truncate,
} from "./table.js";

export interface TerminalOptions {
  color?: boolean;
  /** How many commands get their own flag breakdown. */
  flagDetail?: number;
}

const BOLD = "[1m";
const DIM = "[2m";
const RESET = "[0m";

export function renderTerminal(
  report: Report,
  options: TerminalOptions = {},
): string {
  const { color = false, flagDetail = 8 } = options;

  const bold = (text: string): string =>
    color ? `${BOLD}${text}${RESET}` : text;
  const dim = (text: string): string =>
    color ? `${DIM}${text}${RESET}` : text;
  const heading = (text: string): string => `\n${bold(text)}\n`;

  const sections: string[] = [];

  sections.push(
    [
      bold("Shell history stats"),
      dim(`generated ${formatGeneratedAt(report.generatedAt)}`),
      "",
      `Entries: ${report.summary.entries}   Invocations: ${report.summary.invocations}   Unique commands: ${report.summary.uniqueCommands}`,
      `Ran without any flag: ${report.summary.bare} of ${report.summary.invocations} (${percent(report.summary.bareRatio)})`,
    ].join("\n"),
  );

  sections.push(
    heading("Shells") +
      renderTable(
        [
          { header: "Shell" },
          { header: "Entries", align: "right" },
          { header: "Invocations", align: "right" },
          { header: "Share", align: "right" },
        ],
        report.shells.map((shell) => [
          shell.shell,
          String(shell.entries),
          String(shell.invocations),
          percent(shell.share),
        ]),
      ),
  );

  sections.push(
    heading("Top commands") +
      renderTable(
        [
          { header: "#", align: "right" },
          { header: "Command" },
          { header: "Count", align: "right" },
          { header: "Share", align: "right" },
          { header: "No flags", align: "right" },
          { header: "Via alias" },
        ],
        report.commands.map((command, index) => [
          String(index + 1),
          command.command,
          String(command.count),
          percent(command.share),
          percent(command.bareRatio),
          command.aliases
            .slice(0, 2)
            .map((alias) => `${alias.name} (${alias.count})`)
            .join(", "),
        ]),
      ),
  );

  if (report.subcommands.length > 0) {
    sections.push(
      heading("Top subcommands") +
        renderTable(
          [
            { header: "#", align: "right" },
            { header: "Subcommand" },
            { header: "Count", align: "right" },
            { header: "No flags", align: "right" },
          ],
          report.subcommands.map((item, index) => [
            String(index + 1),
            `${item.command} ${item.subcommand}`,
            String(item.count),
            percent(item.bareRatio),
          ]),
        ),
    );
  }

  sections.push(
    heading("Flags you actually use") +
      report.flagsByCommand
        .slice(0, flagDetail)
        .map((command) => {
          const header = `${bold(command.command)} ${dim(
            `- ${command.count} runs, ${percent(command.bareRatio)} with no flags`,
          )}`;

          if (command.flags.length === 0) {
            return `${header}\n  ${dim("never used a single flag")}`;
          }

          const table = renderTable(
            [
              { header: "Flag" },
              { header: "Count", align: "right" },
              { header: "Of runs", align: "right" },
            ],
            command.flags
              .slice(0, 6)
              .map((flag) => [
                flag.flag,
                String(flag.count),
                percent(flag.share),
              ]),
          );

          return `${header}\n${indent(table)}`;
        })
        .join("\n\n"),
  );

  if (report.aliases.top.length > 0) {
    sections.push(
      heading("Most used aliases") +
        dim(
          `${report.aliases.used} of ${report.aliases.total} invocations (${percent(
            report.aliases.ratio,
          )}) were typed as an alias\n`,
        ) +
        renderTable(
          [
            { header: "#", align: "right" },
            { header: "Alias" },
            { header: "Expands to" },
            { header: "Count", align: "right" },
            { header: "Of aliases", align: "right" },
            { header: "Chars saved", align: "right" },
          ],
          report.aliases.top.map((alias, index) => [
            String(index + 1),
            alias.alias,
            alias.target,
            String(alias.count),
            percent(alias.share),
            String(alias.charsSaved),
          ]),
        ),
    );
  }

  if (report.wrappers.length > 0) {
    sections.push(
      heading("Wrappers") +
        renderTable(
          [{ header: "Wrapper" }, { header: "Count", align: "right" }],
          report.wrappers.map((item) => [item.wrapper, String(item.count)]),
        ),
    );
  }

  sections.push(renderTemporal(report, heading, dim));

  if (report.paths.directories.length > 0) {
    sections.push(
      heading("Busiest directories") +
        dim(
          `based on ${report.paths.withPaths} of ${report.paths.totalEntries} entries (${percent(
            report.paths.coverage,
          )}) that record paths - fish only\n`,
        ) +
        renderTable(
          [{ header: "Directory" }, { header: "Count", align: "right" }],
          report.paths.directories.map((item) => [
            truncate(item.directory, 60),
            String(item.count),
          ]),
        ),
    );
  }

  sections.push(renderHygiene(report, heading, dim));

  return `${sections.join("\n")}\n`;
}

function renderTemporal(
  report: Report,
  heading: (text: string) => string,
  dim: (text: string) => string,
): string {
  const { temporal } = report;

  if (temporal.withTimestamp === 0) {
    return `${heading("When you work")}${dim("no timestamps found in any history file")}`;
  }

  const note = dim(
    `${temporal.withTimestamp} invocations have a timestamp; ${temporal.withoutTimestamp} do not and are excluded here` +
      (temporal.firstSeen
        ? ` (${temporal.firstSeen} to ${temporal.lastSeen})`
        : "") +
      "\n",
  );

  const maxHour = Math.max(...temporal.hours.map((hour) => hour.count));
  const hours = renderTable(
    [{ header: "Hour" }, { header: "Count", align: "right" }, { header: "" }],
    temporal.hours.map((hour) => [
      `${String(hour.hour).padStart(2, "0")}:00`,
      String(hour.count),
      bar(hour.count, maxHour),
    ]),
  );

  const maxWeekday = Math.max(
    ...temporal.weekdays.map((weekday) => weekday.count),
  );
  const weekdays = renderTable(
    [{ header: "Day" }, { header: "Count", align: "right" }, { header: "" }],
    temporal.weekdays.map((weekday) => [
      weekday.label,
      String(weekday.count),
      bar(weekday.count, maxWeekday),
    ]),
  );

  const recent = temporal.months.slice(-12);
  const maxMonth = Math.max(...recent.map((month) => month.count), 0);
  const months =
    recent.length === 0
      ? ""
      : `\n${heading("Monthly trend (last 12)")}` +
        renderTable(
          [
            { header: "Month" },
            { header: "Count", align: "right" },
            { header: "" },
          ],
          recent.map((month) => [
            month.month,
            String(month.count),
            bar(month.count, maxMonth),
          ]),
        );

  return `${heading("When you work")}${note}${hours}\n\n${weekdays}${months}`;
}

function renderHygiene(
  report: Report,
  heading: (text: string) => string,
  dim: (text: string) => string,
): string {
  const { hygiene } = report;
  const parts: string[] = [
    heading("Hygiene") +
      [
        `Unique commands: ${hygiene.uniqueCommands}`,
        `Used exactly once: ${hygiene.usedOnce} (${percent(hygiene.usedOnceRatio)})`,
        `Command length: ${hygiene.averageLength.toFixed(1)} chars on average, ${hygiene.medianLength} median`,
      ].join("\n"),
  ];

  if (hygiene.typoCandidates.length > 0) {
    parts.push(
      `\n${dim("Likely typos")}\n` +
        renderTable(
          [
            { header: "Typed" },
            { header: "Times", align: "right" },
            { header: "Probably meant" },
            { header: "Times", align: "right" },
          ],
          hygiene.typoCandidates.map((typo) => [
            typo.typo,
            String(typo.count),
            typo.likelyMeant,
            String(typo.targetCount),
          ]),
        ),
    );
  }

  if (hygiene.aliasCandidates.length > 0) {
    parts.push(
      `\n${dim("Worth an alias")}\n` +
        renderTable(
          [
            { header: "Command" },
            { header: "Times", align: "right" },
            { header: "Chars", align: "right" },
          ],
          hygiene.aliasCandidates.map((candidate) => [
            truncate(candidate.raw, 60),
            String(candidate.count),
            String(candidate.length),
          ]),
        ),
    );
  }

  return parts.join("\n");
}

function indent(text: string, spaces = 2): string {
  const prefix = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}
