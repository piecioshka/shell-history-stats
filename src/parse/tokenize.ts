export interface Token {
  value: string;
  /** True when the token was produced by an operator such as `|` or `&&`. */
  operator: boolean;
}

const OPERATORS = ["||", "&&", ";;", "|", ";", "&"];

/**
 * Splits a command line into tokens, keeping quoted runs together and treating
 * shell operators as separate tokens. Command substitutions (`$(...)` and
 * backticks) are kept as a single opaque token - their contents are deliberately
 * not analysed.
 */
export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let current = "";
  let index = 0;

  const pushCurrent = (): void => {
    if (current !== "") {
      tokens.push({ value: current, operator: false });
      current = "";
    }
  };

  while (index < line.length) {
    const char = line[index] as string;

    if (char === "\\" && index + 1 < line.length) {
      current += line[index + 1];
      index += 2;
      continue;
    }

    if (char === "'" || char === '"') {
      const closing = line.indexOf(char, index + 1);
      if (closing === -1) {
        current += line.slice(index + 1);
        index = line.length;
      } else {
        current += line.slice(index + 1, closing);
        index = closing + 1;
      }
      continue;
    }

    if (char === "$" && line[index + 1] === "(") {
      const end = matchClosing(line, index + 1, "(", ")");
      current += line.slice(index, end + 1);
      index = end + 1;
      continue;
    }

    // Fish spells command substitution with bare parentheses: `cd (brew --prefix x)`.
    // Without this the closing token would be misread as a flag of the outer command.
    if (char === "(") {
      const end = matchClosing(line, index, "(", ")");
      current += line.slice(index, end + 1);
      index = end + 1;
      continue;
    }

    if (char === "`") {
      const closing = line.indexOf("`", index + 1);
      const end = closing === -1 ? line.length - 1 : closing;
      current += line.slice(index, end + 1);
      index = end + 1;
      continue;
    }

    if (char === " " || char === "\t") {
      pushCurrent();
      index += 1;
      continue;
    }

    // A newline separates commands, not words: fish stores a multi-line entry as
    // one `cmd` field, and each line in it is its own invocation.
    if (char === "\n" || char === "\r") {
      pushCurrent();
      tokens.push({ value: "\n", operator: true });
      index += 1;
      continue;
    }

    // `2>&1` duplicates a descriptor: the `&` belongs to the redirection, not
    // to the background operator, so it is taken whole before the operator
    // check below - otherwise a stray `1` would survive as its own word.
    const duplication = /^[0-9]*[<>]&[0-9-]+/.exec(line.slice(index));
    if (duplication) {
      pushCurrent();
      tokens.push({ value: duplication[0], operator: false });
      index += duplication[0].length;
      continue;
    }

    const operator = OPERATORS.find((candidate) =>
      line.startsWith(candidate, index),
    );
    if (operator) {
      pushCurrent();
      tokens.push({ value: operator, operator: true });
      index += operator.length;
      continue;
    }

    current += char;
    index += 1;
  }

  pushCurrent();
  return tokens;
}

function matchClosing(
  line: string,
  start: number,
  open: string,
  close: string,
): number {
  let depth = 0;

  for (let index = start; index < line.length; index += 1) {
    if (line[index] === open) depth += 1;
    if (line[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return line.length - 1;
}
