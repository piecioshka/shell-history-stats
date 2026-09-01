import { tokenize, type Token } from "./tokenize.js";

/**
 * Splits a command line on `|`, `||`, `&&`, `;` and `&` so that every part of a
 * pipeline counts as its own invocation. Redirections and their targets are
 * dropped, since `> out.txt` says nothing about which flags a command was given.
 */
export function splitSegments(line: string): string[][] {
  const segments: string[][] = [];
  let current: string[] = [];

  const flush = (): void => {
    if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  };

  const tokens = tokenize(line);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] as Token;

    if (token.operator) {
      flush();
      continue;
    }

    if (isRedirection(token.value)) {
      // Skip the redirection and, when it is detached, its target too.
      if (!/\S$/.test(token.value.replace(/^[0-9]*[<>]+&?/, ""))) {
        index += 1;
      }
      continue;
    }

    current.push(token.value);
  }

  flush();
  return segments;
}

function isRedirection(value: string): boolean {
  return /^[0-9]*(>>|<<|>&|<&|>|<)/.test(value);
}
