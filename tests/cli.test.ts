import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  parseArgs,
  parseSince,
  resolveOutputs,
  run,
  UsageError,
} from "../src/cli.js";

const FIXTURES = join(import.meta.dirname, "fixtures");
const FISH = join(FIXTURES, "fish_history");
const ZSH = join(FIXTURES, "zsh_history");
const BASH = join(FIXTURES, "bash_history");

const workdir = mkdtempSync(join(tmpdir(), "shell-history-stats-"));
afterAll(() => rmSync(workdir, { recursive: true, force: true }));

// --no-aliases keeps the tests independent of whatever aliases the machine has.
const base = ["--no-aliases", "--file", FISH, "--file", ZSH, "--file", BASH];

describe("parseArgs", () => {
  it("defaults to the terminal format", () => {
    expect(parseArgs([]).formats).toEqual(["terminal"]);
  });

  it("reads several formats from one flag", () => {
    expect(parseArgs(["--format", "json,html"]).formats).toEqual([
      "json",
      "html",
    ]);
  });

  it("rejects an unknown format", () => {
    expect(() => parseArgs(["--format", "pdf"])).toThrow(UsageError);
  });

  it("rejects an unknown shell", () => {
    expect(() => parseArgs(["--shell", "ksh"])).toThrow(UsageError);
  });

  it("rejects an unknown option", () => {
    expect(() => parseArgs(["--nope"])).toThrow(UsageError);
  });

  it("rejects a flag missing its value", () => {
    expect(() => parseArgs(["--top"])).toThrow(UsageError);
  });

  it("rejects a non-positive top", () => {
    expect(() => parseArgs(["--top", "0"])).toThrow(UsageError);
  });
});

describe("parseSince", () => {
  const now = new Date("2026-09-01T00:00:00Z");

  it("reads an ISO date", () => {
    expect(parseSince("2026-01-01", now)).toBe(Date.parse("2026-01-01") / 1000);
  });

  it("reads a relative span", () => {
    expect(parseSince("30d", now)).toBe(
      Math.floor(now.getTime() / 1000) - 30 * 86_400,
    );
  });

  it("rejects nonsense", () => {
    expect(() => parseSince("yesterday-ish", now)).toThrow(UsageError);
  });
});

describe("resolveOutputs", () => {
  it("uses --out verbatim for a single format", () => {
    expect(resolveOutputs(["markdown"], "stats.md")).toEqual(
      new Map([["markdown", "stats.md"]]),
    );
  });

  it("treats --out as a prefix for several formats", () => {
    expect(resolveOutputs(["markdown", "json"], "report")).toEqual(
      new Map([
        ["markdown", "report.md"],
        ["json", "report.json"],
      ]),
    );
  });

  it("strips a known extension before adding its own", () => {
    expect(resolveOutputs(["markdown", "json"], "report.md").get("json")).toBe(
      "report.json",
    );
  });

  it("writes nothing without --out", () => {
    expect(resolveOutputs(["markdown"], undefined).size).toBe(0);
  });
});

describe("run", () => {
  it("prints help", () => {
    const result = run(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: shell-history-stats");
  });

  it("prints the version", () => {
    expect(run(["--version"], "1.2.3").stdout).toBe("1.2.3\n");
  });

  it("fails on a missing file", () => {
    const result = run(["--file", join(workdir, "nope")]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("No such file");
  });

  it("fails on a bad option without touching the history", () => {
    const result = run(["--totally-unknown"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unknown option");
  });

  it("renders a terminal report from every fixture", () => {
    const result = run(base);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Shell history stats");
    expect(result.stdout).toContain("Top commands");
    expect(result.stdout).toContain("git");
  });

  it("limits a shell with --shell", () => {
    const result = run([...base, "--shell", "bash", "--format", "json"]);
    const report: { summary: { shells: string[] } } = JSON.parse(result.stdout);
    expect(report.summary.shells).toEqual(["bash"]);
  });

  it("reports invocations per shell", () => {
    const result = run([...base, "--format", "json"]);
    const report: { shells: Array<{ shell: string; invocations: number }> } =
      JSON.parse(result.stdout);
    expect(report.shells.map((shell) => shell.shell).sort()).toEqual([
      "bash",
      "fish",
      "zsh",
    ]);
  });

  it("counts a pipeline as several invocations", () => {
    const result = run([...base, "--format", "json"]);
    const report: { summary: { entries: number; invocations: number } } =
      JSON.parse(result.stdout);
    expect(report.summary.invocations).toBeGreaterThan(report.summary.entries);
  });

  it("writes every requested format", () => {
    const prefix = join(workdir, "report");
    const result = run([
      ...base,
      "--format",
      "markdown,json,html",
      "--out",
      prefix,
    ]);

    expect(result.code).toBe(0);
    expect(result.written).toEqual([
      `${prefix}.md`,
      `${prefix}.json`,
      `${prefix}.html`,
    ]);
    expect(readFileSync(`${prefix}.md`, "utf8")).toContain(
      "# Shell history stats",
    );
    expect(readFileSync(`${prefix}.html`, "utf8")).toContain("<!doctype html>");
    expect(() =>
      JSON.parse(readFileSync(`${prefix}.json`, "utf8")),
    ).not.toThrow();
  });

  it("honours --top", () => {
    const result = run([...base, "--format", "json", "--top", "2"]);
    const report: { commands: unknown[] } = JSON.parse(result.stdout);
    expect(report.commands).toHaveLength(2);
  });

  it("drops entries older than --since", () => {
    const result = run([...base, "--format", "json", "--since", "2099-01-01"]);
    const report: { summary: { entries: number } } = JSON.parse(result.stdout);
    // Only the timestamp-less entries survive such a cutoff.
    expect(report.summary.entries).toBeLessThan(11);
  });

  it("renders progress bars that a browser can actually size", () => {
    const target = join(workdir, "bars.html");
    run([...base, "--format", "html", "--out", target]);
    const html = readFileSync(target, "utf8");

    // A span is inline by default and would ignore width, so the fill must be
    // a block box for the bars to show up at all.
    expect(html).toMatch(/\.bar-fill\s*\{[^}]*display:\s*block/);
    expect(html).toMatch(/--pct:\d/);
  });

  it("gives every progress bar the same track width", () => {
    const target = join(workdir, "tracks.html");
    run([...base, "--format", "html", "--out", target]);
    const html = readFileSync(target, "utf8");

    // Fixed outer columns; with fr/auto the tracks sized to their neighbours
    // and came out a few pixels different in every section.
    expect(html).toMatch(/\.bar-row\s*\{[^}]*grid-template-columns:\s*180px/);
    expect(html).toMatch(/\.bar-track\s*\{[^}]*justify-self:\s*start/);
  });

  it("builds a table of contents linking to every section", () => {
    const target = join(workdir, "toc.html");
    run([...base, "--format", "html", "--out", target]);
    const html = readFileSync(target, "utf8");

    const anchors = [...html.matchAll(/<li><a href="#([^"]+)">/g)].map(
      (m) => m[1],
    );
    const ids = [
      ...html.matchAll(/<section class="section" id="([^"]+)">/g),
    ].map((m) => m[1]);

    expect(anchors.length).toBeGreaterThan(1);
    expect(ids).toEqual(expect.arrayContaining(anchors));
  });

  it("keeps one-off flags out of the way without dropping them", () => {
    // A command with two flags used often and three used once each - the shape
    // that made the flags section unreadable before the tail was collapsed.
    const history = join(workdir, "tail_history");
    writeFileSync(
      history,
      [
        ...Array.from({ length: 5 }, () => "git commit -m"),
        ...Array.from({ length: 4 }, () => "git commit -v"),
        "git commit --amend",
        "git commit --no-verify",
        "git commit --squash",
      ].join("\n"),
      "utf8",
    );

    const target = join(workdir, "tail.html");
    run([
      "--no-aliases",
      "--file",
      history,
      "--format",
      "html",
      "--out",
      target,
    ]);
    const html = readFileSync(target, "utf8");

    expect(html).toMatch(/<summary>Show 3 rarely used flags<\/summary>/);
    // Collapsed, not discarded - every flag is still in the document.
    for (const flag of ["--amend", "--no-verify", "--squash"]) {
      expect(html).toContain(flag);
    }
  });

  it("places the alias ranking next to the hygiene section", () => {
    const target = join(workdir, "order.html");
    run([...base, "--format", "html", "--out", target]);
    const html = readFileSync(target, "utf8");

    const aliases = html.indexOf('id="most-used-aliases"');
    const hygiene = html.indexOf('id="hygiene"');
    const worthAnAlias = html.indexOf("Worth an alias");

    if (aliases !== -1) {
      expect(aliases).toBeLessThan(hygiene);
      if (worthAnAlias !== -1) {
        expect(aliases).toBeLessThan(worthAnAlias);
      }
    }
  });

  it("produces html that carries its own styles and no external requests", () => {
    const target = join(workdir, "page.html");
    run([...base, "--format", "html", "--out", target]);
    const html = readFileSync(target, "utf8");

    expect(html).toContain("<style>");
    expect(html).not.toMatch(/<script|https?:\/\//);
  });
});
