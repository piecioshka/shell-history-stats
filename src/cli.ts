import { existsSync, readFileSync, writeFileSync } from "node:fs";

import {
  discoverHistorySources,
  guessShellFromContent,
  guessShellFromPath,
  readHistorySources,
} from "./history/discover.js";
import {
  isShellName,
  SHELL_NAMES,
  type HistorySource,
  type ShellName,
} from "./history/types.js";
import { loadAllAliases } from "./parse/aliases.js";
import { parseEntries } from "./parse/invocation.js";
import { renderHtml } from "./render/html.js";
import { renderJson } from "./render/json.js";
import { renderMarkdown } from "./render/markdown.js";
import { renderTerminal } from "./render/terminal.js";
import { buildReport } from "./stats/report.js";

export const FORMATS = ["terminal", "markdown", "json", "html"] as const;
export type Format = (typeof FORMATS)[number];

const EXTENSIONS: Record<Format, string> = {
  terminal: ".txt",
  markdown: ".md",
  json: ".json",
  html: ".html",
};

export interface Options {
  shells: ShellName[];
  formats: Format[];
  files: string[];
  out?: string;
  top: number;
  since?: number;
  redact: boolean;
  aliases: boolean;
  help: boolean;
  version: boolean;
}

export class UsageError extends Error {}

const HELP = `Usage: shell-history-stats [options]

Analyze your local shell history and report which commands, subcommands and
flags you actually use.

Options:
  --shell <name>      limit to one shell (fish, zsh, bash); repeatable
  --file <path>       read this history file instead of the discovered ones; repeatable
  --format <list>     terminal, markdown, json, html (comma separated, default: terminal)
  --out <path>        write to a file; with several formats it is used as a prefix
  --top <n>           entries per ranking (default: 20)
  --since <date>      only entries at or after this point (2026-01-01 or 30d)
  --no-redact         do not mask values that look like secrets
  --no-aliases        do not expand shell aliases into their target command
  -h, --help          show this help
  -v, --version       show the version

Examples:
  shell-history-stats
  shell-history-stats --shell fish --top 30
  shell-history-stats --format markdown --out stats.md
  shell-history-stats --format json,html --out report --since 90d
`;

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    shells: [],
    formats: [],
    files: [],
    top: 20,
    redact: true,
    aliases: true,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;

    const value = (): string => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-")) {
        throw new UsageError(`Option ${arg} needs a value`);
      }
      index += 1;
      return next;
    };

    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "-v":
      case "--version":
        options.version = true;
        break;
      case "--shell": {
        const shell = value();
        if (!isShellName(shell)) {
          throw new UsageError(
            `Unknown shell "${shell}". Expected one of: ${SHELL_NAMES.join(", ")}`,
          );
        }
        options.shells.push(shell);
        break;
      }
      case "--file":
        options.files.push(value());
        break;
      case "--format":
        options.formats.push(...parseFormats(value()));
        break;
      case "--out":
        options.out = value();
        break;
      case "--top": {
        const top = Number.parseInt(value(), 10);
        if (!Number.isFinite(top) || top <= 0) {
          throw new UsageError("--top needs a positive number");
        }
        options.top = top;
        break;
      }
      case "--since":
        options.since = parseSince(value());
        break;
      case "--no-redact":
        options.redact = false;
        break;
      case "--no-aliases":
        options.aliases = false;
        break;
      default:
        throw new UsageError(`Unknown option "${arg}"`);
    }
  }

  if (options.formats.length === 0) {
    options.formats.push("terminal");
  }

  return options;
}

export function parseFormats(raw: string): Format[] {
  const formats: Format[] = [];

  for (const part of raw.split(",")) {
    const format = part.trim();
    if (format === "") continue;
    if (!(FORMATS as readonly string[]).includes(format)) {
      throw new UsageError(
        `Unknown format "${format}". Expected one of: ${FORMATS.join(", ")}`,
      );
    }
    if (!formats.includes(format as Format)) {
      formats.push(format as Format);
    }
  }

  return formats;
}

/** Accepts an ISO date or a relative span such as `30d`, `12w`, `6m`, `1y`. */
export function parseSince(raw: string, now: Date = new Date()): number {
  const relative = /^(\d+)\s*([dwmy])$/i.exec(raw.trim());

  if (relative) {
    const amount = Number.parseInt(relative[1] as string, 10);
    const unit = (relative[2] as string).toLowerCase();
    const days = unit === "d" ? 1 : unit === "w" ? 7 : unit === "m" ? 30 : 365;
    return Math.floor(now.getTime() / 1000) - amount * days * 86_400;
  }

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    throw new UsageError(
      `Cannot read date "${raw}". Use 2026-01-01 or a span like 30d`,
    );
  }

  return Math.floor(parsed / 1000);
}

/** Resolves where each format is written; a single file format uses --out verbatim. */
export function resolveOutputs(
  formats: Format[],
  out: string | undefined,
): Map<Format, string> {
  const targets = new Map<Format, string>();
  if (out === undefined) {
    return targets;
  }

  const fileFormats = formats.filter(
    (format) => format !== "terminal" || formats.length === 1,
  );

  if (fileFormats.length === 1) {
    targets.set(fileFormats[0] as Format, out);
    return targets;
  }

  const prefix = out.replace(/\.(txt|md|json|html)$/i, "");
  for (const format of fileFormats) {
    targets.set(format, `${prefix}${EXTENSIONS[format]}`);
  }

  return targets;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  written: string[];
}

export function run(argv: string[], version = "0.0.0"): RunResult {
  let options: Options;

  try {
    options = parseArgs(argv);
  } catch (error) {
    const message = error instanceof UsageError ? error.message : String(error);
    return {
      code: 1,
      stdout: "",
      stderr: `${message}\n\n${HELP}`,
      written: [],
    };
  }

  if (options.help) {
    return { code: 0, stdout: HELP, stderr: "", written: [] };
  }

  if (options.version) {
    return { code: 0, stdout: `${version}\n`, stderr: "", written: [] };
  }

  let sources: HistorySource[];

  if (options.files.length > 0) {
    const missing = options.files.filter((file) => !existsSync(file));
    if (missing.length > 0) {
      return {
        code: 1,
        stdout: "",
        stderr: `No such file: ${missing.join(", ")}\n`,
        written: [],
      };
    }

    // A name like `~/.zsh_history` settles it; anything else is recognised
    // from the file itself, so pointing at a copy under some other name does
    // not silently run the wrong parser.
    sources = options.files.map((file) => ({
      shell:
        guessShellFromPath(file) ??
        guessShellFromContent(readFileSync(file, "utf8")),
      file,
    }));
  } else {
    sources = discoverHistorySources();
  }

  if (options.shells.length > 0) {
    sources = sources.filter((source) => options.shells.includes(source.shell));
  }

  if (sources.length === 0) {
    return {
      code: 1,
      stdout: "",
      stderr: "No shell history found. Point at one with --file <path>.\n",
      written: [],
    };
  }

  let entries = readHistorySources(sources);

  if (options.since !== undefined) {
    const since = options.since;
    entries = entries.filter(
      (entry) => entry.timestamp === undefined || entry.timestamp >= since,
    );
  }

  if (entries.length === 0) {
    return {
      code: 1,
      stdout: "",
      stderr: "History is empty after filtering.\n",
      written: [],
    };
  }

  const aliases = options.aliases
    ? loadAllAliases([...new Set(sources.map((source) => source.shell))])
    : undefined;

  const invocations = parseEntries(entries, aliases);
  const report = buildReport(entries, invocations, {
    top: options.top,
    redactSecrets: options.redact,
  });

  const targets = resolveOutputs(options.formats, options.out);
  const written: string[] = [];
  let stdout = "";

  for (const format of options.formats) {
    const content = renderFormat(format, report, targets.has(format));
    const target = targets.get(format);

    if (target === undefined) {
      stdout += content;
      continue;
    }

    try {
      writeFileSync(target, content, "utf8");
      written.push(target);
    } catch (error) {
      return {
        code: 1,
        stdout,
        stderr: `Cannot write ${target}: ${error instanceof Error ? error.message : String(error)}\n`,
        written,
      };
    }
  }

  if (written.length > 0) {
    stdout += `${written.map((file) => `Wrote ${file}`).join("\n")}\n`;
  }

  return { code: 0, stdout, stderr: "", written };
}

function renderFormat(
  format: Format,
  report: ReturnType<typeof buildReport>,
  toFile: boolean,
): string {
  switch (format) {
    case "terminal":
      return renderTerminal(report, {
        color: !toFile && process.stdout.isTTY === true,
      });
    case "markdown":
      return renderMarkdown(report);
    case "json":
      return renderJson(report);
    case "html":
      return renderHtml(report);
  }
}

export { HELP };
