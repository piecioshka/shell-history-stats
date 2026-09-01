import type { Report } from "../stats/report.js";
import { percent, renderMarkdownTable, truncate } from "./table.js";

export function renderMarkdown(report: Report): string {
  const sections: string[] = [
    "# Shell history stats",
    "",
    `Generated ${report.generatedAt.slice(0, 10)}.`,
    "",
    `- Entries: **${report.summary.entries}**`,
    `- Invocations: **${report.summary.invocations}**`,
    `- Unique commands: **${report.summary.uniqueCommands}**`,
    `- Ran without any flag: **${report.summary.bare}** (${percent(report.summary.bareRatio)})`,
    "",
    "## Shells",
    "",
    renderMarkdownTable(
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
    "",
    "## Top commands",
    "",
    renderMarkdownTable(
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
        `\`${command.command}\``,
        String(command.count),
        percent(command.share),
        percent(command.bareRatio),
        command.aliases
          .slice(0, 2)
          .map((alias) => `\`${alias.name}\` (${alias.count})`)
          .join(", "),
      ]),
    ),
  ];

  if (report.subcommands.length > 0) {
    sections.push(
      "",
      "## Top subcommands",
      "",
      renderMarkdownTable(
        [
          { header: "#", align: "right" },
          { header: "Subcommand" },
          { header: "Count", align: "right" },
          { header: "No flags", align: "right" },
        ],
        report.subcommands.map((item, index) => [
          String(index + 1),
          `\`${item.command} ${item.subcommand}\``,
          String(item.count),
          percent(item.bareRatio),
        ]),
      ),
    );
  }

  sections.push("", "## Flags you actually use", "");

  for (const command of report.flagsByCommand) {
    sections.push(
      `### \`${command.command}\``,
      "",
      `${command.count} runs, ${percent(command.bareRatio)} of them with no flags at all.`,
      "",
    );

    if (command.flags.length === 0) {
      sections.push("Never used a single flag.", "");
      continue;
    }

    sections.push(
      renderMarkdownTable(
        [
          { header: "Flag" },
          { header: "Count", align: "right" },
          { header: "Of runs", align: "right" },
        ],
        command.flags.map((flag) => [
          `\`${flag.flag}\``,
          String(flag.count),
          percent(flag.share),
        ]),
      ),
      "",
    );
  }

  if (report.aliases.top.length > 0) {
    sections.push(
      "## Most used aliases",
      "",
      `${report.aliases.used} of ${report.aliases.total} invocations (${percent(
        report.aliases.ratio,
      )}) were typed as an alias.`,
      "",
      renderMarkdownTable(
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
          `\`${alias.alias}\``,
          `\`${alias.target}\``,
          String(alias.count),
          percent(alias.share),
          String(alias.charsSaved),
        ]),
      ),
      "",
    );
  }

  if (report.wrappers.length > 0) {
    sections.push(
      "## Wrappers",
      "",
      renderMarkdownTable(
        [{ header: "Wrapper" }, { header: "Count", align: "right" }],
        report.wrappers.map((item) => [
          `\`${item.wrapper}\``,
          String(item.count),
        ]),
      ),
      "",
    );
  }

  sections.push(...temporalSection(report));

  if (report.paths.directories.length > 0) {
    sections.push(
      "## Busiest directories",
      "",
      `Based on ${report.paths.withPaths} of ${report.paths.totalEntries} entries (${percent(
        report.paths.coverage,
      )}) that record paths - fish only.`,
      "",
      renderMarkdownTable(
        [{ header: "Directory" }, { header: "Count", align: "right" }],
        report.paths.directories.map((item) => [
          `\`${truncate(item.directory, 80)}\``,
          String(item.count),
        ]),
      ),
      "",
    );
  }

  sections.push(...hygieneSection(report));

  return `${sections.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

function temporalSection(report: Report): string[] {
  const { temporal } = report;

  if (temporal.withTimestamp === 0) {
    return [
      "## When you work",
      "",
      "No timestamps found in any history file.",
      "",
    ];
  }

  const range = temporal.firstSeen
    ? ` Covers ${temporal.firstSeen} to ${temporal.lastSeen}.`
    : "";

  return [
    "## When you work",
    "",
    `${temporal.withTimestamp} invocations have a timestamp; ${temporal.withoutTimestamp} do not and are excluded from this section.${range}`,
    "",
    "### By hour",
    "",
    renderMarkdownTable(
      [{ header: "Hour" }, { header: "Count", align: "right" }],
      temporal.hours.map((hour) => [
        `${String(hour.hour).padStart(2, "0")}:00`,
        String(hour.count),
      ]),
    ),
    "",
    "### By weekday",
    "",
    renderMarkdownTable(
      [{ header: "Day" }, { header: "Count", align: "right" }],
      temporal.weekdays.map((weekday) => [
        weekday.label,
        String(weekday.count),
      ]),
    ),
    "",
    "### Monthly trend",
    "",
    renderMarkdownTable(
      [{ header: "Month" }, { header: "Count", align: "right" }],
      temporal.months.map((month) => [month.month, String(month.count)]),
    ),
    "",
  ];
}

function hygieneSection(report: Report): string[] {
  const { hygiene } = report;
  const sections = [
    "## Hygiene",
    "",
    `- Unique commands: **${hygiene.uniqueCommands}**`,
    `- Used exactly once: **${hygiene.usedOnce}** (${percent(hygiene.usedOnceRatio)})`,
    `- Command length: **${hygiene.averageLength.toFixed(1)}** chars on average, **${hygiene.medianLength}** median`,
    "",
  ];

  if (hygiene.typoCandidates.length > 0) {
    sections.push(
      "### Likely typos",
      "",
      renderMarkdownTable(
        [
          { header: "Typed" },
          { header: "Times", align: "right" },
          { header: "Probably meant" },
          { header: "Times", align: "right" },
        ],
        hygiene.typoCandidates.map((typo) => [
          `\`${typo.typo}\``,
          String(typo.count),
          `\`${typo.likelyMeant}\``,
          String(typo.targetCount),
        ]),
      ),
      "",
    );
  }

  if (hygiene.aliasCandidates.length > 0) {
    sections.push(
      "### Worth an alias",
      "",
      renderMarkdownTable(
        [
          { header: "Command" },
          { header: "Times", align: "right" },
          { header: "Chars", align: "right" },
        ],
        hygiene.aliasCandidates.map((candidate) => [
          `\`${truncate(candidate.raw, 80)}\``,
          String(candidate.count),
          String(candidate.length),
        ]),
      ),
      "",
    );
  }

  return sections;
}
