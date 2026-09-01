# shell-history-stats

<p align="center">
  <img src="assets/logo.svg" width="128" alt="shell-history-stats logo"/>
</p>

<!-- prettier-ignore-start -->

[![cli-available](https://badgen.net/static/cli/available/?icon=terminal)](#usage-)
[![node version](https://img.shields.io/node/v/shell-history-stats.svg)](https://www.npmjs.com/package/shell-history-stats)
[![npm version](https://badge.fury.io/js/shell-history-stats.svg)](https://badge.fury.io/js/shell-history-stats)
[![downloads count](https://img.shields.io/npm/dt/shell-history-stats.svg)](https://www.npmjs.com/package/shell-history-stats)
[![size](https://packagephobia.com/badge?p=shell-history-stats)](https://packagephobia.com/result?p=shell-history-stats)
[![license](https://img.shields.io/npm/l/shell-history-stats.svg)](https://piecioshka.mit-license.org)
[![github-ci](https://github.com/piecioshka/shell-history-stats/actions/workflows/ci.yml/badge.svg)](https://github.com/piecioshka/shell-history-stats/actions/workflows/ci.yml)

<!-- prettier-ignore-end -->

🔨 Analyze your local shell history and find out which commands, subcommands and flags you actually use - and which options you never touch.

```bash
npx shell-history-stats
```

![shell-history-stats demo](demo/demo.gif)

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

An excerpt from a run over a sample history - your own report also covers flags, working hours, directories and hygiene.

```text
Entries: 1360   Invocations: 1377   Unique commands: 26
Ran without any flag: 894 of 1377 (64.9%)

Shells
┌───────┬─────────┬─────────────┬────────┐
│ Shell │ Entries │ Invocations │  Share │
├───────┼─────────┼─────────────┼────────┤
│ fish  │    1360 │        1377 │ 100.0% │
└───────┴─────────┴─────────────┴────────┘

Top commands
┌───┬─────────┬───────┬───────┬──────────┬────────────────────┐
│ # │ Command │ Count │ Share │ No flags │ Via alias          │
├───┼─────────┼───────┼───────┼──────────┼────────────────────┤
│ 1 │ git     │   585 │ 42.5% │    54.2% │ gst (62), gp (28)  │
│ 2 │ npm     │   257 │ 18.7% │   100.0% │ nrb (17), nrt (13) │
│ 3 │ ls      │   158 │ 11.5% │    44.3% │ ll (34)            │
│ 4 │ cd      │    60 │  4.4% │   100.0% │                    │
│ 5 │ docker  │    59 │  4.3% │    23.7% │ dc (9)             │
└───┴─────────┴───────┴───────┴──────────┴────────────────────┘

Most used aliases
227 of 1377 invocations (16.5%) were typed as an alias
┌───┬───────┬────────────┬───────┬────────────┬─────────────┐
│ # │ Alias │ Expands to │ Count │ Of aliases │ Chars saved │
├───┼───────┼────────────┼───────┼────────────┼─────────────┤
│ 1 │ gst   │ git status │    62 │      27.3% │         434 │
│ 2 │ ll    │ ls         │    34 │      15.0% │         136 │
│ 3 │ gp    │ git push   │    28 │      12.3% │         168 │
│ 4 │ gd    │ git diff   │    24 │      10.6% │         144 │
│ 5 │ gcm   │ git commit │    21 │       9.3% │         210 │
└───┴───────┴────────────┴───────┴────────────┴─────────────┘
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

## Development 🛠️

```bash
npm install
npm test
npm run build
```

The landing page in [`site/`](site/) is static. `npm run site:build` copies the recorded demo next to it and renders `site/report.html` from `demo/history.fish` - a synthetic history kept in the repository so the sample report never contains anyone's real commands. Both generated files are ignored by git.

## Known limitations 🧭

- The contents of command substitutions (`$(...)`, backticks) are counted as one opaque argument rather than analysed.
- Typo detection is a heuristic: a rare command one edit away from a frequent one. Real tools with short names occasionally show up.
- Only fish records working directories, so the directory ranking covers a subset of your history.

## License 📄

[The MIT License](https://piecioshka.mit-license.org) @ 2026
