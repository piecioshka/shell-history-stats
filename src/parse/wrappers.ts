/**
 * Commands that merely run another command. They are recorded separately so
 * that `sudo apt install` counts towards `apt`, not towards `sudo`.
 */
export const WRAPPERS = new Set([
  "sudo",
  "doas",
  "env",
  "time",
  "nohup",
  "xargs",
  "command",
  "nice",
  "watch",
  "npx",
  "pnpx",
  "bunx",
]);

/** Flags of wrapper commands that consume the following token as their value. */
const WRAPPER_VALUE_FLAGS: Record<string, Set<string>> = {
  sudo: new Set(["-u", "-g", "-p", "-C", "-h"]),
  doas: new Set(["-u", "-C"]),
  xargs: new Set(["-n", "-P", "-I", "-d", "-s", "-a", "-E"]),
  watch: new Set(["-n", "-d"]),
  env: new Set(["-u", "-C"]),
  nice: new Set(["-n"]),
};

/**
 * Shell syntax, not programs. `do echo $f` should count as `echo`, and a bare
 * `done` or `fi` should count as nothing at all.
 */
export const KEYWORDS = new Set([
  "do",
  "done",
  "then",
  "else",
  "elif",
  "fi",
  "end",
  "esac",
  "in",
  "begin",
  "function",
  "if",
  "for",
  "while",
  "until",
  "case",
  "select",
  "switch",
  "and",
  "or",
  "not",
  "!",
  "{",
  "}",
  "[[",
  "]]",
]);

export interface UnwrapResult {
  tokens: string[];
  wrappers: string[];
}

/**
 * Strips leading environment assignments and wrapper commands, returning the
 * tokens of the command that actually ran plus the wrappers seen on the way.
 */
export function unwrap(tokens: string[]): UnwrapResult {
  const wrappers: string[] = [];
  let rest = [...tokens];

  for (;;) {
    while (rest.length > 0 && isEnvAssignment(rest[0] as string)) {
      rest = rest.slice(1);
    }

    const head = rest[0];
    if (head === undefined || !WRAPPERS.has(head)) {
      break;
    }

    wrappers.push(head);
    rest = rest.slice(1);

    const valueFlags = WRAPPER_VALUE_FLAGS[head] ?? new Set<string>();
    while (rest.length > 0) {
      const token = rest[0] as string;
      if (!token.startsWith("-") || token === "-") {
        break;
      }
      rest = rest.slice(1);
      if (valueFlags.has(token) && rest.length > 0) {
        rest = rest.slice(1);
      }
    }
  }

  return { tokens: rest, wrappers };
}

export function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

/** Keywords that introduce a loop variable rather than a command. */
const BINDING_KEYWORDS = new Set([
  "for",
  "while",
  "until",
  "case",
  "select",
  "switch",
  "function",
]);

/**
 * Removes leading shell syntax so that the command inside a compound statement
 * is what gets counted. `do echo x` becomes `echo x`; `for f in *.md` becomes
 * nothing, because there is no command in that fragment.
 */
export function stripKeywords(tokens: string[]): string[] {
  let rest = [...tokens];

  while (rest.length > 0) {
    const head = rest[0] as string;

    if (!KEYWORDS.has(head)) {
      break;
    }

    if (BINDING_KEYWORDS.has(head)) {
      // Drop the whole header: `for f in *.md`, `case $x in`, `function name`.
      const inIndex = rest.indexOf("in");
      rest = inIndex === -1 ? [] : rest.slice(inIndex + 1);
      // What follows `in` is a word list, not a command.
      return [];
    }

    rest = rest.slice(1);
  }

  return rest;
}
