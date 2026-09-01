import { describe, expect, it } from "vitest";

import type { HistoryEntry } from "../src/history/types.js";
import {
  expandAlias,
  parseFishAliases,
  parsePosixAliases,
} from "../src/parse/aliases.js";
import { parseEntry } from "../src/parse/invocation.js";
import { splitSegments } from "../src/parse/segments.js";
import { tokenize } from "../src/parse/tokenize.js";
import { unwrap } from "../src/parse/wrappers.js";

const entry = (command: string): HistoryEntry => ({ command, shell: "fish" });

describe("tokenize", () => {
  it("keeps quoted runs together", () => {
    expect(
      tokenize('git commit -m "hello world"').map((token) => token.value),
    ).toEqual(["git", "commit", "-m", "hello world"]);
  });

  it("keeps a fish command substitution in one token", () => {
    expect(
      tokenize("cd (brew --prefix nmap)/share").map((token) => token.value),
    ).toEqual(["cd", "(brew --prefix nmap)/share"]);
  });

  it("keeps a posix command substitution in one token", () => {
    expect(tokenize("cd $(npm root -g)").map((token) => token.value)).toEqual([
      "cd",
      "$(npm root -g)",
    ]);
  });

  it("marks operators", () => {
    const operators = tokenize("a && b | c").filter((token) => token.operator);
    expect(operators.map((token) => token.value)).toEqual(["&&", "|"]);
  });

  it("survives an unclosed quote", () => {
    expect(tokenize('echo "unterminated').map((token) => token.value)).toEqual([
      "echo",
      "unterminated",
    ]);
  });
});

describe("splitSegments", () => {
  it("splits a pipeline into separate commands", () => {
    expect(splitSegments("ls -la | grep foo | wc -l")).toEqual([
      ["ls", "-la"],
      ["grep", "foo"],
      ["wc", "-l"],
    ]);
  });

  it("splits on && and ;", () => {
    expect(splitSegments("cd /tmp && ls; pwd")).toEqual([
      ["cd", "/tmp"],
      ["ls"],
      ["pwd"],
    ]);
  });

  it("drops redirections", () => {
    expect(splitSegments("echo hi > out.txt")).toEqual([["echo", "hi"]]);
  });
});

describe("unwrap", () => {
  it("strips sudo", () => {
    expect(unwrap(["sudo", "apt", "install", "curl"])).toEqual({
      tokens: ["apt", "install", "curl"],
      wrappers: ["sudo"],
    });
  });

  it("strips sudo flags that take a value", () => {
    expect(unwrap(["sudo", "-u", "root", "ls"])).toEqual({
      tokens: ["ls"],
      wrappers: ["sudo"],
    });
  });

  it("strips environment assignments", () => {
    expect(unwrap(["NODE_ENV=test", "npm", "test"])).toEqual({
      tokens: ["npm", "test"],
      wrappers: [],
    });
  });

  it("strips nested wrappers", () => {
    expect(unwrap(["sudo", "nice", "-n", "10", "make"])).toEqual({
      tokens: ["make"],
      wrappers: ["sudo", "nice"],
    });
  });
});

describe("aliases", () => {
  it("parses zsh output", () => {
    const table = parsePosixAliases("gc='git commit -v'\ng=git\nll='ls -hAlo'");
    expect(table.get("gc")).toBe("git commit -v");
    expect(table.get("g")).toBe("git");
  });

  it("unescapes embedded single quotes", () => {
    const table = parsePosixAliases("c='open -a '\\''Visual Studio Code'\\'''");
    expect(table.get("c")).toBe("open -a 'Visual Studio Code'");
  });

  it("parses fish output and ignores unrelated lines", () => {
    const table = parseFishAliases(
      "some startup banner\nalias gs 'git status'\nalias g git",
    );
    expect(table.get("gs")).toBe("git status");
    expect(table.get("g")).toBe("git");
    expect(table.size).toBe(2);
  });

  it("expands an alias and keeps the remaining arguments", () => {
    const table = new Map([["gc", "git commit -v"]]);
    expect(expandAlias(["gc", "-am", "msg"], table)).toEqual({
      tokens: ["git", "commit", "-v", "-am", "msg"],
      expandedFrom: "gc",
    });
  });

  it("stops on a self-referencing alias", () => {
    const table = new Map([["grep", "grep --color"]]);
    expect(expandAlias(["grep", "foo"], table).tokens).toEqual(["grep", "foo"]);
  });

  it("stops on a cycle", () => {
    const table = new Map([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(expandAlias(["a"], table).tokens.length).toBeLessThan(5);
  });
});

describe("parseEntry", () => {
  it("splits a pipeline into one invocation per segment", () => {
    const invocations = parseEntry(entry("ls -la | grep foo"));
    expect(invocations.map((invocation) => invocation.command)).toEqual([
      "ls",
      "grep",
    ]);
  });

  it("records flags without their values", () => {
    const [invocation] = parseEntry(entry("npm install --save-dev=x vitest"));
    expect(invocation?.flags).toEqual(["--save-dev"]);
    expect(invocation?.argCount).toBe(1);
  });

  it("detects a subcommand of a known multitool", () => {
    const [invocation] = parseEntry(entry("git commit -am wip"));
    expect(invocation?.command).toBe("git");
    expect(invocation?.subcommand).toBe("commit");
    expect(invocation?.flags).toEqual(["-am"]);
  });

  it("does not invent a subcommand for ordinary commands", () => {
    const [invocation] = parseEntry(entry("ls src"));
    expect(invocation?.subcommand).toBeUndefined();
  });

  it("expands an alias and remembers which one was typed", () => {
    const table = new Map([["gc", "git commit -v"]]);
    const [invocation] = parseEntry(entry("gc -am wip"), table);
    expect(invocation?.command).toBe("git");
    expect(invocation?.subcommand).toBe("commit");
    expect(invocation?.alias).toBe("gc");
  });

  it("does not report an alias that only adds flags to its own name", () => {
    const table = new Map([["grep", "grep --color"]]);
    const [invocation] = parseEntry(entry("grep foo"), table);
    expect(invocation?.command).toBe("grep");
    expect(invocation?.alias).toBeUndefined();
  });

  it("does not treat a substitution as a flag of the outer command", () => {
    const [invocation] = parseEntry(entry("cd (brew --prefix nmap)/share"));
    expect(invocation?.command).toBe("cd");
    expect(invocation?.flags).toEqual([]);
  });

  it("counts the wrapped command, not the wrapper", () => {
    const [invocation] = parseEntry(entry("sudo apt install curl"));
    expect(invocation?.command).toBe("apt");
    expect(invocation?.wrappers).toEqual(["sudo"]);
  });

  it("skips a segment that is only a substitution", () => {
    expect(parseEntry(entry("$(which node)"))).toEqual([]);
  });

  it("counts the command inside a loop, not the keywords", () => {
    const invocations = parseEntry(entry("for f in *.md; do echo $f; done"));
    expect(invocations.map((invocation) => invocation.command)).toEqual([
      "echo",
    ]);
  });

  it("counts both commands of a conditional", () => {
    const invocations = parseEntry(entry("if test -f x; then ls; end"));
    expect(invocations.map((invocation) => invocation.command)).toEqual([
      "test",
      "ls",
    ]);
  });

  it("treats a newline inside one entry as a command separator", () => {
    const invocations = parseEntry(
      entry("touch a.md\ngit add a.md\ngit commit -am wip"),
    );
    expect(invocations.map((invocation) => invocation.command)).toEqual([
      "touch",
      "git",
      "git",
    ]);
  });

  it("ignores a bare keyword", () => {
    expect(parseEntry(entry("done"))).toEqual([]);
    expect(parseEntry(entry("fi"))).toEqual([]);
  });
});
