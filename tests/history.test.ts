import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseBashHistory } from "../src/history/bash.js";
import { parseFishHistory } from "../src/history/fish.js";
import {
  guessShellFromContent,
  guessShellFromPath,
} from "../src/history/discover.js";
import { parseZshHistory } from "../src/history/zsh.js";

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

describe("fish history", () => {
  const entries = parseFishHistory(fixture("fish_history"));

  it("reads every entry", () => {
    expect(entries).toHaveLength(4);
    expect(entries.every((entry) => entry.shell === "fish")).toBe(true);
  });

  it("keeps colons inside the command", () => {
    expect(entries[0]?.command).toBe('git commit -m "first: with colon"');
  });

  it("reads the timestamp", () => {
    expect(entries[0]?.timestamp).toBe(1735730000);
  });

  it("unescapes a literal newline", () => {
    expect(entries[2]?.command).toBe("echo one\nnewline");
  });

  it("collects paths when present", () => {
    expect(entries[1]?.paths).toEqual(["/Users/tester/projects/app"]);
    expect(entries[0]?.paths).toBeUndefined();
  });

  it("ignores a trailing incomplete block", () => {
    expect(parseFishHistory("- cmd: ls\n  when: not-a-number")[0]).toEqual({
      command: "ls",
      shell: "fish",
    });
  });
});

describe("zsh history", () => {
  const entries = parseZshHistory(fixture("zsh_history"));

  it("reads extended-format lines", () => {
    expect(entries[0]).toEqual({
      command: "git push --force",
      shell: "zsh",
      timestamp: 1735730400,
    });
  });

  it("keeps lines without a timestamp", () => {
    const plain = entries.find(
      (entry) => entry.command === "plain command without timestamp",
    );
    expect(plain).toBeDefined();
    expect(plain?.timestamp).toBeUndefined();
  });

  it("joins commands continued with a backslash", () => {
    expect(entries.at(-1)?.command).toBe("echo multi \nline command");
  });
});

describe("bash history", () => {
  const entries = parseBashHistory(fixture("bash_history"));

  it("reads one command per line without timestamps", () => {
    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.timestamp === undefined)).toBe(true);
  });

  it("understands HISTTIMEFORMAT timestamps when present", () => {
    const withTime = parseBashHistory("#1735730000\nls -la\n#1735730100\npwd");
    expect(withTime).toEqual([
      { command: "ls -la", shell: "bash", timestamp: 1735730000 },
      { command: "pwd", shell: "bash", timestamp: 1735730100 },
    ]);
  });
});

describe("guessShellFromPath", () => {
  it.each([
    ["/home/x/.local/share/fish/fish_history", "fish"],
    ["/home/x/.zsh_history", "zsh"],
    ["/home/x/.bash_history", "bash"],
  ])("maps %s to %s", (path, expected) => {
    expect(guessShellFromPath(path)).toBe(expected);
  });

  it("returns null for an unknown name", () => {
    expect(guessShellFromPath("/tmp/whatever.log")).toBeNull();
  });
});

describe("guessShellFromContent", () => {
  it.each([
    ["- cmd: ls\n  when: 1735730000\n", "fish"],
    [": 1735730400:0;git push\n", "zsh"],
    ["ls\ngit status\n", "bash"],
    ["#1735730000\nls\n", "bash"],
  ])("recognises %j as %s", (content, expected) => {
    expect(guessShellFromContent(content)).toBe(expected);
  });

  it("falls back to bash for an empty file", () => {
    expect(guessShellFromContent("")).toBe("bash");
  });

  it("is not fooled by a command that merely looks like a marker", () => {
    // A bash history can legitimately contain a line starting with `- cmd:`
    // only as a one-off; fish always pairs it with a `when:` line.
    expect(guessShellFromContent("echo '- cmd: not fish'\nls\n")).toBe("bash");
  });
});
