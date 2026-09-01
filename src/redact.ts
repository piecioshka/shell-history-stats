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

/** Long unbroken base64-ish runs are almost always keys rather than words. */
const LONG_OPAQUE_VALUE = /\b[A-Za-z0-9+/_-]{40,}={0,2}\b/g;

export const REDACTED = "***";

/**
 * Masks anything that looks like a credential. Aggregation keys are computed on
 * the unredacted text - only displayed values pass through here, so that
 * `--token=A` and `--token=B` still count as one `--token`.
 */
export function redact(text: string): string {
  let result = text;

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
