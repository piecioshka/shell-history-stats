import { homedir } from "node:os";

const SECRET_TOKEN_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bsk-[A-Za-z0-9-]{16,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{12,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

/** Flags whose value is a secret regardless of how it looks. */
const SECRET_FLAG_NAMES =
  "token|password|passwd|pwd|secret|api[-_]?key|apikey|auth|credential|private[-_]?key|access[-_]?key";

const SECRET_FLAG_INLINE = new RegExp(
  `(--?(?:${SECRET_FLAG_NAMES})=)(\\S+)`,
  "gi",
);
const SECRET_FLAG_SPACED = new RegExp(
  `(--?(?:${SECRET_FLAG_NAMES})\\s+)(\\S+)`,
  "gi",
);
const SECRET_ENV_ASSIGNMENT = new RegExp(
  `\\b([A-Z0-9_]*(?:${SECRET_FLAG_NAMES.toUpperCase().replace(/\[-_\]\?/g, "_?")})[A-Z0-9_]*=)(\\S+)`,
  "gi",
);

/**
 * MySQL takes the password glued to the flag (`-pSecret`). Only an attached
 * value is masked here, so a bare `-p` (git log, docker compose) and its
 * detached argument are left alone.
 */
const SECRET_ATTACHED_PASSWORD = /(^|\s)(-p)(\S+)/g;

/**
 * `-p` means "password" only for a handful of commands; elsewhere it is a port
 * (`docker run -p 8080:80`, `ssh -p 2222`) or a patch (`git log -p`). Matching
 * the subcommand too keeps `docker login -p` apart from `docker run -p`, and
 * the anchor stops a later word from triggering it.
 */
const PASSWORD_FLAG_COMMANDS =
  /^\s*(?:sudo\s+)?(?:(?:docker|podman)\s+login|mysqladmin)\b/;
const SECRET_DETACHED_PASSWORD = /(\s-p\s+)(\S+)/g;

/**
 * `user:password` pairs, either as the argument of a credentials flag
 * (`curl -u admin:hunter2`) or inside a connection URI
 * (`postgres://user:pass@host`). Requires the `@` in the URI case so that a
 * host:port or a `host:/path` is not mistaken for a credential.
 */
// The user part is length-capped: an unbounded run before the colon makes the
// match quadratic on a long non-matching token.
const SECRET_USER_PASSWORD_FLAG =
  /(--?(?:u|user|username)\s+[^\s:]{1,128}:)(\S+)/gi;
// Every run is length-capped: an unbounded scheme or user part backtracks
// quadratically on a long token that never reaches the closing `@`.
const SECRET_URI_CREDENTIALS =
  /(\b[a-z][a-z0-9+.-]{0,15}:\/\/[^\s:/@]{1,128}:)([^\s@/]{1,256})(@)/gi;

/**
 * Secrets passed as a header value rather than a flag: `-H 'X-Api-Key: abc'`.
 * The name has to look like a credential header, so `-H 'Accept: text/html'`
 * survives untouched.
 */
// Both sides of the header name are length-capped for the same reason as above:
// real header names are short, and unbounded runs cost quadratic time.
const SECRET_HEADER = new RegExp(
  `((?:^|['"\\s])(?:[A-Za-z0-9-]{0,32}(?:${SECRET_FLAG_NAMES}|authorization)[A-Za-z0-9-]{0,32})\\s*:\\s*)(?:(Bearer|Basic|Token)\\s+)?([^\\s'"]+)`,
  "gi",
);

/** Long unbroken base64-ish runs are almost always keys rather than words. */
const LONG_OPAQUE_VALUE = /\b[A-Za-z0-9+/_-]{40,}={0,2}\b/g;

export const REDACTED = "***";

/**
 * Replaces the home directory with `~`. The path names the account, which a
 * report meant to be shared should not carry. The boundary check keeps
 * `/home/tester-other` from being mistaken for a subpath of `/home/tester`.
 */
function shortenHome(text: string, home: string): string {
  if (home === "" || home === "/") {
    return text;
  }

  const escaped = home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`${escaped}(?=/|\\s|$)`, "g"), "~");
}

/**
 * Masks anything that looks like a credential. Aggregation keys are computed on
 * the unredacted text - only displayed values pass through here, so that
 * `--token=A` and `--token=B` still count as one `--token`.
 */
export function redact(text: string, home: string = homedir()): string {
  let result = shortenHome(text, home);

  for (const pattern of SECRET_TOKEN_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }

  result = result.replace(
    SECRET_FLAG_INLINE,
    (_match, flag: string) => `${flag}${REDACTED}`,
  );
  result = result.replace(
    SECRET_FLAG_SPACED,
    (_match, flag: string) => `${flag}${REDACTED}`,
  );
  result = result.replace(
    SECRET_ENV_ASSIGNMENT,
    (_match, name: string) => `${name}${REDACTED}`,
  );
  result = result.replace(
    SECRET_HEADER,
    (_match, prefix: string, scheme: string | undefined) =>
      `${prefix}${scheme === undefined ? "" : `${scheme} `}${REDACTED}`,
  );
  result = result.replace(
    SECRET_URI_CREDENTIALS,
    (_match, prefix: string, _password: string, suffix: string) =>
      `${prefix}${REDACTED}${suffix}`,
  );
  result = result.replace(
    SECRET_USER_PASSWORD_FLAG,
    (_match, prefix: string) => `${prefix}${REDACTED}`,
  );
  result = result.replace(
    SECRET_ATTACHED_PASSWORD,
    (_match, lead: string, flag: string) => `${lead}${flag}${REDACTED}`,
  );

  if (PASSWORD_FLAG_COMMANDS.test(result)) {
    result = result.replace(
      SECRET_DETACHED_PASSWORD,
      (_match, prefix: string) => `${prefix}${REDACTED}`,
    );
  }
  result = result.replace(LONG_OPAQUE_VALUE, (match) =>
    looksLikePath(match) ? match : REDACTED,
  );

  return result;
}

export function redactIf(enabled: boolean, text: string): string {
  return enabled ? redact(text) : text;
}

function looksLikePath(value: string): boolean {
  return value.includes("/") && !/^[A-Za-z0-9+/]{40,}={0,2}$/.test(value);
}
