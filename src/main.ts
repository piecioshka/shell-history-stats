import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "./cli.js";

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", "package.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (parsed !== null && typeof parsed === "object" && "version" in parsed) {
      const version = (parsed as { version?: unknown }).version;
      if (typeof version === "string") {
        return version;
      }
    }
  } catch {
    // Version is cosmetic - fall through to the placeholder.
  }

  return "0.0.0";
}

export function main(argv: string[] = process.argv.slice(2)): void {
  const result = run(argv, readVersion());

  if (result.stdout !== "") process.stdout.write(result.stdout);
  if (result.stderr !== "") process.stderr.write(result.stderr);

  process.exitCode = result.code;
}
