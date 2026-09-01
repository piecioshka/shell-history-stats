import type { Invocation } from "../parse/invocation.js";
import { ratio } from "./commands.js";

export interface FlagStat {
  flag: string;
  count: number;
  /** Share of this command's invocations that carried the flag. */
  share: number;
}

export interface CommandFlagStat {
  command: string;
  count: number;
  bareCount: number;
  bareRatio: number;
  flags: FlagStat[];
  /** How many invocations used 0, 1, 2, 3+ arguments. */
  argHistogram: Record<string, number>;
}

/**
 * Per command: how often it ran with no flags at all, and which flags actually
 * get used. This is the answer to "which options do I skip in practice".
 */
export function collectFlagStats(
  invocations: Invocation[],
  minCount = 1,
): CommandFlagStat[] {
  const buckets = new Map<
    string,
    {
      count: number;
      bare: number;
      flags: Map<string, number>;
      args: Map<string, number>;
    }
  >();

  for (const invocation of invocations) {
    let bucket = buckets.get(invocation.command);
    if (!bucket) {
      bucket = { count: 0, bare: 0, flags: new Map(), args: new Map() };
      buckets.set(invocation.command, bucket);
    }

    bucket.count += 1;
    if (invocation.flags.length === 0) {
      bucket.bare += 1;
    }

    // A flag repeated on one line still counts once for that invocation.
    for (const flag of new Set(invocation.flags)) {
      bucket.flags.set(flag, (bucket.flags.get(flag) ?? 0) + 1);
    }

    const argKey =
      invocation.argCount >= 3 ? "3+" : String(invocation.argCount);
    bucket.args.set(argKey, (bucket.args.get(argKey) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .filter(([, bucket]) => bucket.count >= minCount)
    .map(([command, bucket]) => ({
      command,
      count: bucket.count,
      bareCount: bucket.bare,
      bareRatio: ratio(bucket.bare, bucket.count),
      flags: [...bucket.flags.entries()]
        .map(([flag, count]) => ({
          flag,
          count,
          share: ratio(count, bucket.count),
        }))
        .sort((a, b) => b.count - a.count || a.flag.localeCompare(b.flag)),
      argHistogram: {
        "0": bucket.args.get("0") ?? 0,
        "1": bucket.args.get("1") ?? 0,
        "2": bucket.args.get("2") ?? 0,
        "3+": bucket.args.get("3+") ?? 0,
      },
    }))
    .sort((a, b) => b.count - a.count);
}

/** Overall share of invocations that carried no flags. */
export function overallBareRatio(invocations: Invocation[]): {
  total: number;
  bare: number;
  ratio: number;
} {
  const bare = invocations.filter(
    (invocation) => invocation.flags.length === 0,
  ).length;
  return {
    total: invocations.length,
    bare,
    ratio: ratio(bare, invocations.length),
  };
}

/** Most used flags across every command, useful as a global summary. */
export function collectGlobalFlagStats(invocations: Invocation[]): FlagStat[] {
  const counts = new Map<string, number>();
  let withFlags = 0;

  for (const invocation of invocations) {
    if (invocation.flags.length > 0) {
      withFlags += 1;
    }
    for (const flag of new Set(invocation.flags)) {
      counts.set(flag, (counts.get(flag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([flag, count]) => ({ flag, count, share: ratio(count, withFlags) }))
    .sort((a, b) => b.count - a.count || a.flag.localeCompare(b.flag));
}
