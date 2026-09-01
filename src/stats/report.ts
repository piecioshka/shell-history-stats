import type { HistoryEntry, ShellName } from "../history/types.js";
import type { Invocation } from "../parse/invocation.js";
import { redact } from "../redact.js";
import {
  aliasUsageSummary,
  collectAliasStats,
  collectCommandStats,
  collectShellStats,
  collectSubcommandStats,
  collectWrapperStats,
  type AliasStat,
  type CommandStat,
  type ShellStat,
  type SubcommandStat,
} from "./commands.js";
import {
  collectFlagStats,
  collectGlobalFlagStats,
  overallBareRatio,
  type CommandFlagStat,
  type FlagStat,
} from "./flags.js";
import { collectHygieneStats, type HygieneStats } from "./hygiene.js";
import { collectPathStats, type PathStats } from "./paths.js";
import { collectTemporalStats, type TemporalStats } from "./temporal.js";

export interface ReportOptions {
  top: number;
  redactSecrets: boolean;
  /** Only commands seen at least this often get a flag breakdown. */
  minFlagCommandCount?: number;
}

export interface Report {
  generatedAt: string;
  summary: {
    entries: number;
    invocations: number;
    uniqueCommands: number;
    bare: number;
    bareRatio: number;
    shells: ShellName[];
  };
  shells: ShellStat[];
  commands: CommandStat[];
  subcommands: SubcommandStat[];
  flagsByCommand: CommandFlagStat[];
  globalFlags: FlagStat[];
  aliases: {
    /** Invocations reached through an alias, of all invocations. */
    used: number;
    total: number;
    ratio: number;
    top: AliasStat[];
  };
  wrappers: Array<{ wrapper: string; count: number }>;
  temporal: TemporalStats;
  paths: PathStats;
  hygiene: HygieneStats;
}

export function buildReport(
  entries: HistoryEntry[],
  invocations: Invocation[],
  options: ReportOptions,
): Report {
  const { top, redactSecrets, minFlagCommandCount = 5 } = options;

  const entriesPerShell: Record<ShellName, number> = {
    fish: 0,
    zsh: 0,
    bash: 0,
  };
  for (const entry of entries) {
    entriesPerShell[entry.shell] += 1;
  }

  const bare = overallBareRatio(invocations);
  const commands = collectCommandStats(invocations);
  const hygiene = collectHygieneStats(invocations);
  const paths = collectPathStats(entries);
  const aliasUsage = aliasUsageSummary(invocations);

  const report: Report = {
    generatedAt: new Date().toISOString(),
    summary: {
      entries: entries.length,
      invocations: invocations.length,
      uniqueCommands: commands.length,
      bare: bare.bare,
      bareRatio: bare.ratio,
      shells: (Object.keys(entriesPerShell) as ShellName[]).filter(
        (shell) => entriesPerShell[shell] > 0,
      ),
    },
    shells: collectShellStats(invocations, entriesPerShell),
    commands: commands.slice(0, top),
    subcommands: collectSubcommandStats(invocations).slice(0, top),
    flagsByCommand: collectFlagStats(invocations, minFlagCommandCount)
      .slice(0, top)
      .map((stat) => ({ ...stat, flags: stat.flags.slice(0, top) })),
    globalFlags: collectGlobalFlagStats(invocations).slice(0, top),
    aliases: {
      used: aliasUsage.aliased,
      total: aliasUsage.total,
      ratio: aliasUsage.ratio,
      top: collectAliasStats(invocations).slice(0, top),
    },
    wrappers: collectWrapperStats(invocations),
    temporal: collectTemporalStats(invocations),
    paths: { ...paths, directories: paths.directories.slice(0, top) },
    hygiene,
  };

  return redactSecrets ? redactReport(report) : report;
}

/**
 * Applies masking to the free-text fields only. Counts and keys were computed
 * before this point, so redaction never changes the numbers.
 */
function redactReport(report: Report): Report {
  return {
    ...report,
    // A command invoked by absolute path carries the home directory, and so
    // names the account; masking it here covers every renderer at once.
    commands: report.commands.map((command) => ({
      ...command,
      command: redact(command.command),
    })),
    subcommands: report.subcommands.map((item) => ({
      ...item,
      command: redact(item.command),
    })),
    // A value glued to a short flag (`-pSecret`) parses as one token, so the
    // secret becomes the flag's own name and has to be masked like free text.
    flagsByCommand: report.flagsByCommand.map((command) => ({
      ...command,
      command: redact(command.command),
      flags: command.flags.map((flag) => ({
        ...flag,
        flag: redact(flag.flag),
      })),
    })),
    globalFlags: report.globalFlags.map((flag) => ({
      ...flag,
      flag: redact(flag.flag),
    })),
    hygiene: {
      ...report.hygiene,
      longest: report.hygiene.longest.map((item) => ({
        ...item,
        raw: redact(item.raw),
      })),
      aliasCandidates: report.hygiene.aliasCandidates.map((item) => ({
        ...item,
        raw: redact(item.raw),
      })),
    },
    paths: {
      ...report.paths,
      directories: report.paths.directories.map((item) => ({
        ...item,
        directory: redact(item.directory),
      })),
    },
  };
}
