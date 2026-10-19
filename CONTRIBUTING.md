# Contributing to shell-history-stats

How to build, test and change the tool. For what it does and how to use it, see the [README](README.md).

## Getting started

Prerequisites: Node.js from `.nvmrc` (`lts/krypton`). The published package supports Node 20 and newer (`engines`).

```bash
git clone https://github.com/piecioshka/shell-history-stats
cd shell-history-stats
npm install
npm test
npm run build
```

`npm run build` compiles `src/` into `dist/` with `tsc`. After that `npm start` runs the CLI from the working copy (`node bin/cli.js`), and any CLI flag can follow `--`, for example `npm start -- --shell fish --top 30`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run build` | compiles TypeScript into `dist/` |
| `npm start` | runs the CLI from `bin/cli.js` (needs a build first) |
| `npm test` | unit tests (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | tests with coverage |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier, writes changes |
| `npm run format:check` | Prettier, check only |
| `npm run site:build` | builds the package, then renders the sample report for the landing page |
| `npm run clear` | removes `dist/` and `coverage/` |

`prepack` runs the build, so `npm pack` always ships a fresh `dist/`.

## Tests

Tests live in `tests/` and read the sample histories in `tests/fixtures/` (`fish_history`, `zsh_history`, `bash_history`). They cover the history readers, the command parser, the statistics and the CLI.

## Project structure

- `bin/cli.js` - the executable, a thin wrapper around `dist/`
- `src/history/` - discovery and readers for fish, zsh and bash history files
- `src/parse/` - tokenizing, splitting pipelines into segments, wrappers like `sudo`, alias expansion
- `src/stats/` - commands, flags, paths, working hours, hygiene (typos, alias candidates) and the report that combines them
- `src/render/` - terminal tables, Markdown, JSON and HTML output
- `src/redact.ts` - masking of values that look like secrets
- `src/index.ts` - the public library API
- `site/` - the static landing page
- `demo/` - the synthetic history and the recording used in the README

## Landing page and demo

The landing page in [`site/`](site/) is static. `npm run site:build` copies the recorded demo next to it and renders `site/report.html` from `demo/history.fish` - a synthetic history kept in the repository so the sample report never contains anyone's real commands. Both generated files are ignored by git. More about the demo assets in [`demo/README.md`](demo/README.md).

## CI and deployment

- [`ci.yml`](.github/workflows/ci.yml) runs on every push and pull request: `format:check`, `lint`, `typecheck`, `test`, `build`, with Node from `.nvmrc`.
- [`pages.yml`](.github/workflows/pages.yml) runs on every push to `main` (or by hand), runs `npm run site:build` and publishes `site/` to GitHub Pages.

## Conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`). Version bumps are plain commits named after the version, like `1.0.0`.
