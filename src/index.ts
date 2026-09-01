export {
  run,
  parseArgs,
  parseSince,
  parseFormats,
  resolveOutputs,
  UsageError,
} from "./cli.js";
export type { Options, Format, RunResult } from "./cli.js";

export {
  discoverHistorySources,
  readHistorySource,
  readHistorySources,
  guessShellFromPath,
  guessShellFromContent,
} from "./history/discover.js";
export { parseFishHistory } from "./history/fish.js";
export { parseZshHistory } from "./history/zsh.js";
export { parseBashHistory } from "./history/bash.js";
export type {
  HistoryEntry,
  HistorySource,
  ShellName,
} from "./history/types.js";

export { parseEntry, parseEntries } from "./parse/invocation.js";
export type { Invocation } from "./parse/invocation.js";
export { loadAliases, loadAllAliases, expandAlias } from "./parse/aliases.js";
export type { AliasTable } from "./parse/aliases.js";
export { tokenize } from "./parse/tokenize.js";
export { splitSegments } from "./parse/segments.js";
export { unwrap } from "./parse/wrappers.js";

export { buildReport } from "./stats/report.js";
export type { Report, ReportOptions } from "./stats/report.js";
export {
  collectCommandStats,
  collectSubcommandStats,
} from "./stats/commands.js";
export { collectFlagStats, overallBareRatio } from "./stats/flags.js";
export { collectTemporalStats } from "./stats/temporal.js";
export { collectPathStats } from "./stats/paths.js";
export { collectHygieneStats } from "./stats/hygiene.js";

export { renderTerminal } from "./render/terminal.js";
export { renderMarkdown } from "./render/markdown.js";
export { renderJson } from "./render/json.js";
export { renderHtml } from "./render/html.js";

export { redact } from "./redact.js";
