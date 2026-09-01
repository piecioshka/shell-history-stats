import { describe, expect, it } from "vitest";

import type { HistoryEntry } from "../src/history/types.js";
import type { Invocation } from "../src/parse/invocation.js";
import { formatGeneratedAt } from "../src/render/table.js";
import { homedir } from "node:os";

import { redact } from "../src/redact.js";
import {
  aliasUsageSummary,
  collectAliasStats,
  collectCommandStats,
  collectSubcommandStats,
} from "../src/stats/commands.js";
import { collectFlagStats, overallBareRatio } from "../src/stats/flags.js";
import {
  editDistanceWithin,
  findTypoCandidates,
} from "../src/stats/hygiene.js";
import { collectPathStats } from "../src/stats/paths.js";
import { buildReport } from "../src/stats/report.js";
import { collectTemporalStats } from "../src/stats/temporal.js";

function invocation(
  overrides: Partial<Invocation> & { command: string },
): Invocation {
  return {
    shell: "fish",
    flags: [],
    argCount: 0,
    wrappers: [],
    raw: overrides.command,
    ...overrides,
  };
}

describe("command stats", () => {
  const invocations = [
    invocation({ command: "git", subcommand: "commit", flags: ["-m"] }),
    invocation({ command: "git", subcommand: "commit", flags: ["-m"] }),
    invocation({ command: "git", subcommand: "status" }),
    invocation({ command: "ls", shell: "zsh", alias: "ll", flags: ["-la"] }),
    invocation({ command: "ls", shell: "bash" }),
  ];

  it("ranks commands by frequency", () => {
    const stats = collectCommandStats(invocations);
    expect(stats[0]?.command).toBe("git");
    expect(stats[0]?.count).toBe(3);
  });

  it("computes the share of runs with no flags", () => {
    const git = collectCommandStats(invocations).find(
      (stat) => stat.command === "git",
    );
    expect(git?.bareCount).toBe(1);
    expect(git?.bareRatio).toBeCloseTo(1 / 3);
  });

  it("counts each shell separately", () => {
    const ls = collectCommandStats(invocations).find(
      (stat) => stat.command === "ls",
    );
    expect(ls?.perShell).toEqual({ fish: 0, zsh: 1, bash: 1 });
  });

  it("lists the aliases used to reach a command", () => {
    const ls = collectCommandStats(invocations).find(
      (stat) => stat.command === "ls",
    );
    expect(ls?.aliases).toEqual([{ name: "ll", count: 1 }]);
  });

  it("ranks subcommands", () => {
    const stats = collectSubcommandStats(invocations);
    expect(stats[0]).toMatchObject({
      command: "git",
      subcommand: "commit",
      count: 2,
    });
  });
});

describe("alias stats", () => {
  const invocations = [
    invocation({
      command: "git",
      subcommand: "commit",
      alias: "gc",
      aliasTarget: "git commit",
    }),
    invocation({
      command: "git",
      subcommand: "commit",
      alias: "gc",
      aliasTarget: "git commit",
    }),
    invocation({
      command: "git",
      subcommand: "push",
      alias: "g",
      aliasTarget: "git",
    }),
    invocation({ command: "ls" }),
  ];

  it("ranks aliases by how often they are typed", () => {
    const stats = collectAliasStats(invocations);
    expect(stats[0]).toMatchObject({
      alias: "gc",
      target: "git commit",
      count: 2,
    });
    expect(stats[1]).toMatchObject({ alias: "g", target: "git", count: 1 });
  });

  it("reports the target of the alias, not of the invocation", () => {
    // `g push` must stay `git`; the subcommand was typed by hand.
    expect(collectAliasStats(invocations)[1]?.target).toBe("git");
  });

  it("counts the characters saved", () => {
    // "git commit" (10) minus "gc" (2), twice.
    expect(collectAliasStats(invocations)[0]?.charsSaved).toBe(16);
  });

  it("counts flags in the definition as saved typing", () => {
    // `ll='ls -la'` saves the flags too, even though the ranking labels the
    // target as plain `ls`.
    const stats = collectAliasStats([
      invocation({
        command: "ls",
        flags: ["-la"],
        alias: "ll",
        aliasTarget: "ls",
        aliasExpansion: "ls -la",
      }),
    ]);

    expect(stats[0]?.charsSaved).toBe("ls -la".length - "ll".length);
  });

  it("shares are relative to aliased invocations only", () => {
    const stats = collectAliasStats(invocations);
    expect(stats[0]?.share).toBeCloseTo(2 / 3);
  });

  it("summarises how much of the history went through aliases", () => {
    expect(aliasUsageSummary(invocations)).toEqual({
      aliased: 3,
      total: 4,
      ratio: 0.75,
    });
  });

  it("returns nothing when no alias was used", () => {
    expect(collectAliasStats([invocation({ command: "ls" })])).toEqual([]);
  });
});

describe("flag stats", () => {
  const invocations = [
    invocation({ command: "git", flags: ["-m", "-m"] }),
    invocation({ command: "git", flags: ["-v"] }),
    invocation({ command: "git" }),
    invocation({ command: "git" }),
  ];

  it("counts a repeated flag once per invocation", () => {
    const git = collectFlagStats(invocations)[0];
    expect(git?.flags.find((flag) => flag.flag === "-m")?.count).toBe(1);
  });

  it("reports how often a command runs bare", () => {
    const git = collectFlagStats(invocations)[0];
    expect(git?.bareCount).toBe(2);
    expect(git?.bareRatio).toBe(0.5);
  });

  it("builds an argument histogram", () => {
    const stats = collectFlagStats([
      invocation({ command: "rm", argCount: 0 }),
      invocation({ command: "rm", argCount: 2 }),
      invocation({ command: "rm", argCount: 7 }),
    ]);
    expect(stats[0]?.argHistogram).toEqual({ "0": 1, "1": 0, "2": 1, "3+": 1 });
  });

  it("computes the overall bare ratio", () => {
    expect(overallBareRatio(invocations)).toEqual({
      total: 4,
      bare: 2,
      ratio: 0.5,
    });
  });
});

describe("temporal stats", () => {
  it("separates invocations with and without a timestamp", () => {
    const stats = collectTemporalStats([
      invocation({ command: "ls", timestamp: 1735730000 }),
      invocation({ command: "ls" }),
    ]);
    expect(stats.withTimestamp).toBe(1);
    expect(stats.withoutTimestamp).toBe(1);
  });

  it("reports empty buckets when nothing has a timestamp", () => {
    const stats = collectTemporalStats([invocation({ command: "ls" })]);
    expect(stats.withTimestamp).toBe(0);
    expect(stats.firstSeen).toBeUndefined();
    expect(stats.hours).toHaveLength(24);
  });

  it("buckets by month", () => {
    const stats = collectTemporalStats([
      invocation({
        command: "ls",
        timestamp: Math.floor(Date.UTC(2026, 0, 15, 12) / 1000),
      }),
    ]);
    expect(stats.months[0]?.month).toMatch(/^2026-01$/);
  });
});

describe("path stats", () => {
  it("counts directories and shortens the home prefix", () => {
    const entries: HistoryEntry[] = [
      {
        command: "vim a",
        shell: "fish",
        paths: ["/home/tester/projects/app/index.ts"],
      },
      {
        command: "vim b",
        shell: "fish",
        paths: ["/home/tester/projects/app/other.ts"],
      },
      { command: "ls", shell: "fish" },
    ];
    const stats = collectPathStats(entries, "/home/tester");
    expect(stats.directories[0]).toEqual({
      directory: "~/projects/app",
      count: 2,
    });
    expect(stats.withPaths).toBe(2);
    expect(stats.coverage).toBeCloseTo(2 / 3);
  });
});

describe("hygiene", () => {
  it("finds a rare command one edit from a frequent one", () => {
    const counts = new Map([
      ["git", 500],
      ["gti", 2],
      ["ls", 300],
    ]);
    expect(findTypoCandidates(counts)).toEqual([
      { typo: "gti", count: 2, likelyMeant: "git", targetCount: 500 },
    ]);
  });

  it("does not flag a known short tool as a typo", () => {
    const counts = new Map([
      ["cd", 1000],
      ["od", 3],
      ["ls", 500],
      ["nc", 2],
    ]);
    expect(findTypoCandidates(counts)).toEqual([]);
  });

  it("does not flag a frequent command as a typo", () => {
    const counts = new Map([
      ["git", 500],
      ["get", 400],
    ]);
    expect(findTypoCandidates(counts)).toEqual([]);
  });

  it("counts a transposition as a single edit", () => {
    expect(editDistanceWithin("git", "gti", 1)).toBe(true);
    expect(editDistanceWithin("ls", "sl", 1)).toBe(true);
    expect(editDistanceWithin("mkdir", "mkdri", 1)).toBe(true);
  });

  it("measures edit distance within a limit", () => {
    expect(editDistanceWithin("git", "gt", 1)).toBe(true);
    expect(editDistanceWithin("git", "xyz", 1)).toBe(false);
    expect(editDistanceWithin("git", "gitkraken", 1)).toBe(false);
  });
});

describe("formatGeneratedAt", () => {
  it("shows the date and the time", () => {
    expect(formatGeneratedAt("2026-09-01T13:25:07.000Z")).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
  });

  it("renders the timestamp in local time, not UTC", () => {
    // Slicing the ISO string printed UTC under a local-looking label, so a
    // report generated at 15:25 in Warsaw claimed 13:25. The suite pins
    // TZ=Europe/Warsaw so this stays a real assertion rather than a tautology.
    expect(formatGeneratedAt("2026-09-01T13:25:07.000Z")).toBe(
      "2026-09-01 15:25",
    );
  });

  it("rolls over the date when local time is a day ahead", () => {
    expect(formatGeneratedAt("2026-09-01T22:30:00.000Z")).toBe(
      "2026-09-02 00:30",
    );
  });
});

describe("redact", () => {
  it.each([
    ["gh auth login --token ghp_abcdefghijklmnopqrstuvwxyz012345", "ghp_"],
    ["curl -H 'x' --api-key=abcdef123456", "abcdef123456"],
    ["export AWS_SECRET_KEY=verysecretvalue123", "verysecretvalue123"],
  ])("masks %s", (input, secret) => {
    expect(redact(input)).not.toContain(secret);
  });

  it("leaves ordinary commands alone", () => {
    expect(redact("git commit -m 'fix the thing'")).toBe(
      "git commit -m 'fix the thing'",
    );
  });

  it.each([
    // Attached values: MySQL and Docker take the password glued to the flag.
    ["mysql -u root -pSuperSecret123", "SuperSecret123"],
    ["docker login -u me -p mypassword123 registry.io", "mypassword123"],
    // user:password pairs, as an argument and inside a connection URI.
    ["curl -u admin:hunter2 https://api.example.com", "hunter2"],
    ["psql postgres://user:p4ssw0rd@localhost:5432/db", "p4ssw0rd"],
    ["git clone https://me:tokenvalue123@github.com/x/y.git", "tokenvalue123"],
    // Secrets carried by a header rather than a flag.
    ["curl -H 'X-Api-Key: abcd1234efgh5678' url", "abcd1234efgh5678"],
    [
      'curl -H "Authorization: Bearer abcd1234efgh5678" url',
      "abcd1234efgh5678",
    ],
  ])("masks %s", (input, secret) => {
    expect(redact(input)).not.toContain(secret);
  });

  it("stays linear on long inputs that never match", () => {
    // Every pattern is length-capped so a pathological history entry cannot
    // make redaction backtrack quadratically.
    const inputs = [
      `curl -H ${"a".repeat(100_000)}token: x`,
      `x -u ${"a".repeat(100_000)}:b`,
      `https://${"a".repeat(50_000)}:${"b".repeat(50_000)}@host`,
    ];

    const start = Date.now();
    for (const input of inputs) redact(input);

    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("keeps normal paths readable", () => {
    const path = "/Users/tester/projects/some-longer-directory-name/file.ts";
    expect(redact(path)).toBe(path);
  });

  it("shortens the home directory it is given", () => {
    // The home path names the account, which a shared report should not carry.
    expect(redact("/home/tester/bin/deploy.sh", "/home/tester")).toBe(
      "~/bin/deploy.sh",
    );
    expect(redact("cd /home/tester/projects", "/home/tester")).toBe(
      "cd ~/projects",
    );
  });

  it("leaves a path that merely starts with the same letters", () => {
    expect(redact("/home/tester-other/x", "/home/tester")).toBe(
      "/home/tester-other/x",
    );
  });

  it.each([
    // `-p` is a plain flag for most tools; only an attached value is a secret.
    "git log -p",
    "docker compose up -d",
    "ssh -p 2222 host",
    // A colon is not a credential separator outside a header or a URI.
    "npm run build:prod",
    "kubectl get pods -n kube-system",
    "curl https://example.com:8443/health",
    "rsync -av host:/srv/data ./data",
    // `-p` is a port here, not a password - only `docker login` takes one.
    "docker run -p 8080:80 nginx",
    "curl -H 'Accept: application/json' https://api.example.com",
  ])("leaves %s alone", (input) => {
    expect(redact(input)).toBe(input);
  });
});

describe("buildReport", () => {
  const entries: HistoryEntry[] = [
    { command: "git commit -m x", shell: "fish", timestamp: 1735730000 },
    { command: "ls", shell: "bash" },
  ];
  const invocations = [
    invocation({
      command: "git",
      subcommand: "commit",
      flags: ["-m"],
      timestamp: 1735730000,
    }),
    invocation({ command: "ls", shell: "bash" }),
  ];

  it("summarises the whole run", () => {
    const report = buildReport(entries, invocations, {
      top: 10,
      redactSecrets: true,
    });
    expect(report.summary).toMatchObject({
      entries: 2,
      invocations: 2,
      uniqueCommands: 2,
      bare: 1,
    });
    expect(report.summary.shells).toEqual(["fish", "bash"]);
  });

  it("honours the top limit", () => {
    const many = Array.from({ length: 50 }, (_, index) =>
      invocation({ command: `cmd${index}` }),
    );
    const report = buildReport(entries, many, { top: 5, redactSecrets: true });
    expect(report.commands).toHaveLength(5);
  });

  it("redacts a secret carried by a flag name", () => {
    // `-pSecret` parses as one token, so the password ends up as the flag's
    // own name rather than as free text.
    const secret = invocation({
      command: "mysql",
      flags: ["-pSuperSecret123"],
      raw: "mysql -u root -pSuperSecret123",
    });
    const report = buildReport(entries, [secret, secret, secret, secret], {
      top: 10,
      redactSecrets: true,
    });

    expect(JSON.stringify(report)).not.toContain("SuperSecret123");
    expect(report.globalFlags[0]?.count).toBe(4);
  });

  it("shortens a home path used as the command name", () => {
    const run = invocation({
      command: `${homedir()}/secret-project/deploy.sh`,
      raw: `${homedir()}/secret-project/deploy.sh --prod`,
    });
    const report = buildReport(entries, [run], {
      top: 10,
      redactSecrets: true,
    });

    expect(JSON.stringify(report)).not.toContain(homedir());
    expect(report.commands[0]?.command).toBe("~/secret-project/deploy.sh");
  });

  it("redacts free text without changing counts", () => {
    const secret = invocation({
      command: "gh",
      raw: "gh auth login --token ghp_abcdefghijklmnopqrstuvwxyz012345",
    });
    const report = buildReport(
      entries,
      [secret, secret, secret, secret, secret],
      {
        top: 10,
        redactSecrets: true,
      },
    );
    expect(JSON.stringify(report)).not.toContain(
      "ghp_abcdefghijklmnopqrstuvwxyz012345",
    );
    expect(report.commands[0]?.count).toBe(5);
  });
});
