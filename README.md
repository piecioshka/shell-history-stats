# shell-history-stats 🔨

Analyze your local shell history and find out which commands, subcommands and flags you actually use - and which options you never touch.

<!-- prettier-ignore-start -->

[![npm version](https://img.shields.io/npm/v/shell-history-stats.svg)](https://www.npmjs.com/package/shell-history-stats)

[![CI](https://github.com/piecioshka/shell-history-stats/actions/workflows/ci.yml/badge.svg)](https://github.com/piecioshka/shell-history-stats/actions/workflows/ci.yml)

[![license](https://img.shields.io/npm/l/shell-history-stats.svg)](https://piecioshka.mit-license.org)

<!-- prettier-ignore-end -->

## Features ✨

- 🐟 Reads **fish**, **zsh** and **bash** history, together or one at a time
- 🎭 Expands your **aliases**, so `gc` counts as `git commit` and still shows which shorthand you typed
- 🏆 Ranks your **most used aliases**, with the share of your typing they cover and the characters they save
- 🚩 Reports the **flags you actually use** per command, with the share of runs that had no flags at all
- 🌳 Breaks multitools into **subcommands** (`git commit`, `npm run`, `docker build`)
- 🧵 Splits pipelines, so `ls | grep foo` counts as two invocations rather than one
- 🎩 Sees through wrappers - `sudo apt install` counts towards `apt`, not `sudo`
- 🕰️ Shows **when you work** by hour, weekday and month, and says how many entries lacked a timestamp
- 📁 Ranks the **directories** you work in (fish records them)
- 🩺 Flags likely **typos** and long commands that deserve an alias
- 🛡️ Masks anything that looks like a **secret** before it reaches the report
- 📄 Prints tables, or writes Markdown, JSON and a self-contained HTML page
- 📦 Zero runtime dependencies

## Installation 📦

```bash
npm install --global shell-history-stats
```

Or run it without installing:

```bash
npx shell-history-stats
```

## Usage 🚀

```bash
# every history file found on this machine
shell-history-stats

# one shell, longer rankings
shell-history-stats --shell fish --top 30

# a Markdown report for your notes
shell-history-stats --format markdown --out stats.md

# JSON and HTML from the last 90 days
shell-history-stats --format json,html --out report --since 90d
```

### Options

| Option | Description |
| :-- | :-- |
| `--shell <name>` | Limit to one shell: `fish`, `zsh` or `bash`. Repeatable. |
| `--file <path>` | Read this history file instead of the discovered ones. Repeatable. |
| `--format <list>` | `terminal`, `markdown`, `json`, `html`. Comma separated. |
| `--out <path>` | Write to a file. With several formats it is used as a prefix. |
| `--top <n>` | Entries per ranking. Default `20`. |
| `--since <date>` | Only entries at or after `2026-01-01`, or a span like `30d`, `6m`. |
| `--no-redact` | Do not mask values that look like secrets. |
| `--no-aliases` | Do not expand shell aliases into their target command. |
| `-h`, `--help` | Show help. |
| `-v`, `--version` | Show the version. |

## Example output 📊

```text
Entries: 11   Invocations: 12   Unique commands: 8
Ran without any flag: 9 of 12 (75.0%)

Top commands
┌───┬─────────┬───────┬───────┬──────────┬───────────┐
│ # │ Command │ Count │ Share │ No flags │ Via alias │
├───┼─────────┼───────┼───────┼──────────┼───────────┤
│ 1 │ git     │     3 │ 25.0% │    33.3% │ gc (2)    │
│ 2 │ echo    │     2 │ 16.7% │   100.0% │           │
│ 3 │ ls      │     2 │ 16.7% │    50.0% │ ll (1)    │
└───┴─────────┴───────┴───────┴──────────┴───────────┘

Flags you actually use
git - 3 runs, 33.3% with no flags
  ┌──────┬───────┬─────────┐
  │ Flag │ Count │ Of runs │
  ├──────┼───────┼─────────┤
  │ -m   │     1 │   33.3% │
  │ -v   │     1 │   33.3% │
  └──────┴───────┴─────────┘
```

## How it reads your history 🔍

Each shell stores history differently, and the parser handles each one on its own terms.

| Shell | Format | Timestamps |
| :-- | :-- | :-- |
| `fish` | YAML-like, with optional `paths:` per entry | Always |
| `zsh` | `: <started>:<elapsed>;<command>` | With `EXTENDED_HISTORY` |
| `bash` | One command per line | Only with `HISTTIMEFORMAT` |

Sections that need a timestamp say how many entries they had to skip, so a bash-heavy machine never silently reports a partial picture.

> [!NOTE] Aliases are read by asking your shell for its own alias table, because plugin frameworks like oh-my-zsh define most aliases at load time rather than in a file. Use `--no-aliases` to skip that step.

## Privacy 🛡️

Everything runs locally - no network access, no telemetry. Values that look like credentials (tokens, `--password`, API keys, long opaque strings) are masked before they reach any output, so a report is safe to paste into notes or an issue. Counts are computed before masking, so the numbers stay correct. Pass `--no-redact` if you want the raw text.

## API 📚

The package can also be used as a library:

```js
import {
  discoverHistorySources,
  readHistorySources,
  parseEntries,
  buildReport,
  renderMarkdown,
} from "shell-history-stats";

const entries = readHistorySources(discoverHistorySources());
const report = buildReport(entries, parseEntries(entries), {
  top: 20,
  redactSecrets: true,
});

console.log(renderMarkdown(report));
```

## Known limitations 🧭

- The contents of command substitutions (`$(...)`, backticks) are counted as one opaque argument rather than analysed.
- Typo detection is a heuristic: a rare command one edit away from a frequent one. Real tools with short names occasionally show up.
- Only fish records working directories, so the directory ranking covers a subset of your history.

## License 📄

[The MIT License](https://piecioshka.mit-license.org) @ 2026
